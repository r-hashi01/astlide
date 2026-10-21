/**
 * Dev-only endpoint behind the in-browser slide editor (`e` in `astro dev`).
 *
 *   GET  /__astlide/source?path=src/content/decks/talk/01-cover.mdx → { path, content }
 *   POST /__astlide/source  { path, content }                        → { ok: true }
 *   GET  /__astlide/editor-token                                     → { token }
 *
 * Writing the file lets Astro's dev server rebuild the slide. Astro would then
 * tell the browser to do a full page reload; for writes made by the editor we
 * swap that for a custom `astlide:source-saved` HMR event instead, and the
 * editor patches just the changed part of the slide while keeping the editor,
 * scripts and media state alive. Likewise, when a slide file is added or
 * removed, the reload becomes `astlide:deck-changed` and slide pages
 * soft-navigate to the new deck instead. Pages that don't handle these events
 * reload as before (see `DEV_RELOAD_SCRIPT`).
 *
 * Only slide sources can be read or written: the path must resolve
 * inside the project's `src/` (symlinks included) and end in `.mdx`, `.md` or
 * `.html`. Every request must be local — from this machine (loopback, even with
 * `astro dev --host`), addressed to a loopback host name (`localhost`,
 * `127.0.0.1` …) and not relayed by a proxy or tunnel — come from the dev
 * server's own origin (required for POSTs; for GETs, any cross-site marker
 * refuses), and carry the per-server token (`x-astlide-editor-token`). The
 * editor fetches that token from `/__astlide/editor-token`, which answers only
 * such same-origin local requests, so no other site or origin can read it.
 * Registered with `apply: "serve"`, so it never exists in a production build.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";

export const EDITOR_ENDPOINT = "/__astlide/source";
/** Where the editor gets the dev server's token (see {@link refuseEditorRequest}). */
export const EDITOR_TOKEN_ENDPOINT = "/__astlide/editor-token";
/** HMR event sent instead of a full reload after an editor write. */
export const SOURCE_SAVED_EVENT = "astlide:source-saved";
/** HMR event sent instead of a full reload after a slide file is added or removed. */
export const DECK_CHANGED_EVENT = "astlide:deck-changed";
/**
 * Injected into every page in dev: pages that don't live-update (anything but
 * a slide page — the deck index, `/all`, the site's own pages) reload on our
 * events, as they would have on the full reload they replace.
 */
export const DEV_RELOAD_SCRIPT = `if (import.meta.hot) {
	// Slide pages (data-deck-sources) update themselves through the editor module.
	const reload = () => { if (!document.body.hasAttribute("data-deck-sources")) location.reload(); };
	import.meta.hot.on(${JSON.stringify(SOURCE_SAVED_EVENT)}, reload);
	import.meta.hot.on(${JSON.stringify(DECK_CHANGED_EVENT)}, reload);
}`;
/** Header carrying the dev server's editor token. */
export const EDITOR_TOKEN_HEADER = "x-astlide-editor-token";
/** A new random editor token (one per dev server start). */
export function createEditorToken(): string {
	return randomBytes(24).toString("hex");
}
/** How long after a write (or file add/remove) a full reload is considered its echo. */
const RELOAD_ECHO_MS = 3000;
const SLIDE_SOURCE = /\.(mdx|md|html)$/i;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Resolve a slide path from the client to an absolute file path, or `null` if
 * it isn't an editable slide source inside `<root>/src/`.
 */
export function resolveSlideSource(root: string, path: unknown): string | null {
	if (typeof path !== "string" || path.length === 0 || path.includes("\0")) return null;
	if (!SLIDE_SOURCE.test(path)) return null;
	const srcDir = resolve(root, "src");
	const absolute = resolve(root, path);
	const rel = relative(srcDir, absolute);
	if (
		rel === "" ||
		rel.startsWith("..") ||
		rel.startsWith(sep) ||
		isAbsolute(rel) ||
		resolve(srcDir, rel) !== absolute
	) {
		return null;
	}
	return absolute;
}

/** A POST must come from the page the dev server served (blocks cross-site writes). */
export function isSameOrigin(req: Pick<IncomingMessage, "headers">): boolean {
	const origin = req.headers.origin;
	const host = req.headers.host;
	if (!origin || !host) return false;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}

/** Whether a socket address is this machine (127.0.0.0/8, ::1, or IPv4-mapped loopback). */
export function isLoopback(address: string | undefined): boolean {
	if (!address) return false;
	const v4 = address.startsWith("::ffff:") ? address.slice(7) : address;
	return address === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4);
}

/**
 * Whether a host name (from `Host` or an origin, port allowed) names this
 * machine: `localhost`, `*.localhost`, 127.0.0.0/8 or `[::1]`. A page reached
 * under any other name came through something else — a tunnel, a proxy, the
 * network — even when the connection itself is from loopback.
 */
export function isLoopbackHost(host: string | undefined): boolean {
	if (!host) return false;
	let hostname: string;
	try {
		hostname = new URL(`http://${host}`).hostname.toLowerCase();
	} catch {
		return false;
	}
	return (
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		hostname === "[::1]" ||
		/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
	);
}

/** Headers proxies and tunnels add; a request carrying one wasn't made on this machine. */
const RELAY_HEADER =
	/^(?:forwarded|via|x-forwarded-.*|x-real-ip|cf-connecting-ip|true-client-ip|x-client-ip|ngrok-.*)$/;

/** Whether a request was relayed by a proxy or tunnel (see {@link RELAY_HEADER}). */
export function isRelayed(req: Pick<IncomingMessage, "headers">): boolean {
	return Object.keys(req.headers).some((name) => RELAY_HEADER.test(name.toLowerCase()));
}

type EditorRequest = Pick<IncomingMessage, "headers" | "method"> & {
	socket?: { remoteAddress?: string | undefined };
};

/**
 * Why a request isn't a local, same-origin one, or `null` when it is: from
 * loopback, to a loopback host name, not relayed, and from the dev server's
 * own origin (POST: Origin required; GET: no foreign Origin and no cross-site
 * `Sec-Fetch-Site`).
 */
export function refuseNonLocal(req: EditorRequest): string | null {
	if (!isLoopback(req.socket?.remoteAddress) || !isLoopbackHost(req.headers.host) || isRelayed(req))
		return "The slide editor only accepts requests made on this machine (localhost)";
	const origin = req.headers.origin;
	if (origin && !isLoopbackHost(hostOf(origin))) return "Cross-origin request refused";
	if (req.method === "POST") return isSameOrigin(req) ? null : "Cross-origin write refused";
	const site = req.headers["sec-fetch-site"];
	if (site && site !== "same-origin" && site !== "none") return "Cross-origin read refused";
	if (origin && !isSameOrigin(req)) return "Cross-origin read refused";
	return null;
}

function hostOf(origin: string): string | undefined {
	try {
		return new URL(origin).host;
	} catch {
		return undefined;
	}
}

function sameToken(given: unknown, token: string): boolean {
	if (typeof given !== "string") return false;
	const a = Buffer.from(given);
	const b = Buffer.from(token);
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Why an editor request is refused, or `null` when it may proceed: it must be
 * local and same-origin ({@link refuseNonLocal}) and carry the dev server's token.
 */
export function refuseEditorRequest(req: EditorRequest, token: string): string | null {
	const nonLocal = refuseNonLocal(req);
	if (nonLocal) return nonLocal;
	if (!sameToken(req.headers[EDITOR_TOKEN_HEADER], token)) return "Missing or wrong editor token";
	return null;
}

/**
 * Whether `file` (which may not exist yet) is really inside `<root>/src/`,
 * following symlinks: a link under `src/` must not lead elsewhere.
 */
async function realInsideSrc(root: string, file: string): Promise<boolean> {
	try {
		const srcDir = await realpath(resolve(root, "src"));
		let target: string;
		try {
			target = await realpath(file);
		} catch {
			target = join(await realpath(dirname(file)), basename(file));
		}
		return target.startsWith(srcDir + sep);
	} catch {
		return false;
	}
}

function send(res: ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
	let size = 0;
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		size += chunk.length;
		if (size > MAX_BODY_BYTES) throw new Error("Body too large");
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString("utf-8");
}

type HotPayload = { type?: string; event?: string; path?: string; data?: unknown };
type Sender = (payload: HotPayload, ...rest: unknown[]) => void;

/** A change whose reload echo should become `event` instead. */
export interface PendingChange {
	event: string;
	path: string;
	removed?: boolean;
}

/**
 * Wrap a hot channel's `send` so that, shortly after an editor write or a slide
 * file being added / removed, every `full-reload` becomes the pending change's
 * event instead. Astro may send several per change (one per changed module, and
 * a later one once the content store has synced); the client coalesces them, so
 * the last refresh is guaranteed to see the settled page. The content store's
 * reload (`path: "*"`) is flagged `committed`: the new content is in place.
 */
export function interceptReloads(
	channel: { send: Sender } | undefined,
	pending: () => PendingChange | null,
): void {
	if (!channel || (channel.send as Sender & { __astlide?: true }).__astlide) return;
	const original = channel.send.bind(channel) as Sender;
	const wrapped: Sender & { __astlide?: true } = (payload, ...rest) => {
		const change = pending();
		if (change && payload && typeof payload === "object" && payload.type === "full-reload") {
			const { event, ...data } = change;
			const committed = payload.path === "*" ? { committed: true } : {};
			original({ type: "custom", event, data: { ...data, ...committed } });
			return;
		}
		original(payload, ...rest);
	};
	wrapped.__astlide = true;
	channel.send = wrapped;
}

/**
 * @param token The dev server's editor token (see {@link createEditorToken}),
 *   handed to the dev server's own pages at {@link EDITOR_TOKEN_ENDPOINT}.
 */
export function astlideEditorPlugin(root: string, token: string): Plugin {
	// The last editor write or slide file add/remove, while its reload echo can
	// still arrive.
	let last: { change: PendingChange; at: number } | null = null;
	const pending = () => (last && Date.now() - last.at < RELOAD_ECHO_MS ? last.change : null);
	const track = (change: PendingChange) => {
		last = { change, at: Date.now() };
	};

	return {
		name: "astlide:editor",
		apply: "serve",
		configureServer(server) {
			// Astro reloads through both the ws server and the client environment's hot
			// channel; intercept both. Every reload within the echo window of a write
			// becomes an event.
			interceptReloads(server.ws as unknown as { send: Sender }, pending);
			interceptReloads(
				server.environments?.client?.hot as unknown as { send: Sender } | undefined,
				pending,
			);

			// A slide file added or removed changes the deck's order and length.
			const onDeckFile = (removed: boolean) => (file: string) => {
				const path = relative(root, file).split(sep).join("/");
				if (resolveSlideSource(root, path)) {
					track({ event: DECK_CHANGED_EVENT, path, ...(removed ? { removed } : {}) });
				}
			};
			server.watcher.on("add", onDeckFile(false));
			server.watcher.on("unlink", onDeckFile(true));

			// The token, for the dev server's own pages only (never cached; see refuseNonLocal).
			server.middlewares.use(EDITOR_TOKEN_ENDPOINT, (req, res) => {
				if (req.method !== "GET") {
					res.setHeader("Allow", "GET");
					return send(res, 405, { error: "Method not allowed" });
				}
				const refused = refuseNonLocal(req);
				if (refused) return send(res, 403, { error: refused });
				return send(res, 200, { token });
			});

			server.middlewares.use(EDITOR_ENDPOINT, async (req, res) => {
				try {
					if (req.method !== "GET" && req.method !== "POST") {
						res.setHeader("Allow", "GET, POST");
						return send(res, 405, { error: "Method not allowed" });
					}
					const refused = refuseEditorRequest(req, token);
					if (refused) return send(res, 403, { error: refused });
					if (req.method === "GET") {
						const url = new URL(req.url ?? "", "http://localhost");
						const file = resolveSlideSource(root, url.searchParams.get("path"));
						if (!file || !(await realInsideSrc(root, file)))
							return send(res, 400, { error: "Not an editable slide source" });
						const content = await readFile(file, "utf-8");
						return send(res, 200, { path: url.searchParams.get("path"), content });
					}
					if (req.method === "POST") {
						const body = JSON.parse(await readBody(req)) as { path?: unknown; content?: unknown };
						const file = resolveSlideSource(root, body.path);
						if (!file || typeof body.content !== "string" || !(await realInsideSrc(root, file))) {
							return send(res, 400, { error: "Not an editable slide source" });
						}
						track({ event: SOURCE_SAVED_EVENT, path: String(body.path) });
						await writeFile(file, body.content, "utf-8");
						return send(res, 200, { ok: true });
					}
					return send(res, 405, { error: "Method not allowed" });
				} catch (error) {
					return send(res, 500, { error: (error as Error).message });
				}
			});
		},
	};
}
