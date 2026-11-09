/**
 * Dev-only endpoint behind the in-browser slide editor (`e` in `astro dev`).
 *
 *   GET  /__astlide/source?path=src/content/decks/talk/01-cover.mdx → { path, content }
 *   POST /__astlide/source  { path, content }                        → { ok: true }
 *   GET  /__astlide/editor-token                                     → { token }
 *   GET  /__astlide/editor?code=<one-time code>                      → enables this browser
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
 * Only existing slide sources can be read or written: the path must end in
 * `.mdx`, `.md` or `.html` and name a file that already exists inside the
 * decks folder (`src/content/decks`, symlinks followed) — no new files, nothing
 * under `src/pages` or elsewhere. Every request must be local — from this machine (loopback, even with
 * `astro dev --host`), addressed to a loopback host name (`localhost`,
 * `127.0.0.1` …) and not relayed by a proxy or tunnel — come from the dev
 * server's own origin (required for POSTs; for GETs, any cross-site marker
 * refuses), and carry the per-server token (`x-astlide-editor-token`). The
 * editor fetches that token from `/__astlide/editor-token`, which answers only
 * such same-origin local requests, so no other site or origin can read it.
 *
 * All of that can still be imitated by something that relays raw TCP to the
 * dev server (`ssh -R`, a port forward): it looks exactly like a local
 * browser. So editing also needs a browser the developer enabled: `astro dev`
 * prints a link with a one-time code (single use, expires after
 * {@link UNLOCK_CODE_TTL_MS}), and opening it sets an HttpOnly cookie for this
 * project and port, derived from the project's editor secret (kept in
 * `node_modules/.astro/`, never served or printed). Without the cookie the
 * editor endpoints refuse.
 * Registered with `apply: "serve"`, so it never exists in a production build.
 */

import { readFile, writeFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { join, relative, sep } from "node:path";
import {
	createUnlockCodes,
	EDITOR_LOCKED_MESSAGE,
	editorCookie,
	isEnabledBrowser,
	refuseEditorRequest,
	refuseNonLocal,
	type UnlockCodes,
} from "@astlide/astro/internal/editor/access";
import {
	DECK_CHANGED_EVENT,
	EDITOR_ENDPOINT,
	EDITOR_TOKEN_ENDPOINT,
	EDITOR_UNLOCK_ENDPOINT,
	SOURCE_SAVED_EVENT,
} from "@astlide/astro/internal/editor/protocol";
import {
	interceptReloads,
	type PendingChange,
	RELOAD_ECHO_MS,
	type Sender,
} from "@astlide/astro/internal/editor/reloads";
import {
	editableSource,
	readBody,
	resolveSlideSource,
} from "@astlide/astro/internal/editor/sources";
import { decksDirIn } from "@astlide/core/deck/files";
import type { Plugin } from "vite";

// What this module exported before the editor's parts moved to `editor/`.
export {
	cookieOf,
	createEditorToken,
	createUnlockCodes,
	EDITOR_COOKIE_PREFIX,
	EDITOR_LOCKED_MESSAGE,
	editorCookie,
	isEnabledBrowser,
	isLoopback,
	isLoopbackHost,
	isRelayed,
	isSameOrigin,
	loadEditorSecret,
	refuseEditorRequest,
	refuseNonLocal,
	UNLOCK_CODE_TTL_MS,
	type UnlockCodes,
} from "@astlide/astro/internal/editor/access";
export {
	DECK_CHANGED_EVENT,
	EDITOR_ENDPOINT,
	EDITOR_TOKEN_ENDPOINT,
	EDITOR_TOKEN_HEADER,
	EDITOR_UNLOCK_ENDPOINT,
	SOURCE_SAVED_EVENT,
} from "@astlide/astro/internal/editor/protocol";
export { interceptReloads, type PendingChange } from "@astlide/astro/internal/editor/reloads";
export { editableSource, resolveSlideSource } from "@astlide/astro/internal/editor/sources";

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

/** A refusal; the editor shows {@link EDITOR_LOCKED_MESSAGE} as is. */
function refuse(res: ServerResponse, error: string): void {
	send(res, 403, error === EDITOR_LOCKED_MESSAGE ? { error, locked: true } : { error });
}

export function send(res: ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	res.end(JSON.stringify(body));
}

/**
 * @param token The dev server's editor token (see {@link createEditorToken}),
 *   handed to the dev server's own pages at {@link EDITOR_TOKEN_ENDPOINT}.
 * @param secret The project's editor secret (see {@link loadEditorSecret}).
 * @param base Astro's `base`: where {@link EDITOR_UNLOCK_ENDPOINT} sends the browser.
 * @param unlock The one-time codes `astro dev` prints (see {@link createUnlockCodes}).
 * @param decksDir The folder whose slide files the editor may edit.
 */
export function astlideEditorPlugin(
	root: string,
	token: string,
	secret: string,
	base = "/",
	unlock: UnlockCodes = createUnlockCodes(),
	decksDir = decksDirIn(join(root, "src")),
): Plugin {
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
				if (resolveSlideSource(root, path, decksDir)) {
					track({ event: DECK_CHANGED_EVENT, path, ...(removed ? { removed } : {}) });
				}
			};
			server.watcher.on("add", onDeckFile(false));
			server.watcher.on("unlink", onDeckFile(true));

			// The link `astro dev` prints: enables editing in the browser that opens it.
			server.middlewares.use(EDITOR_UNLOCK_ENDPOINT, (req, res) => {
				if (req.method !== "GET") {
					res.setHeader("Allow", "GET");
					return send(res, 405, { error: "Method not allowed" });
				}
				const refused = refuseNonLocal(req);
				if (refused) return refuse(res, refused);
				const code = new URL(req.url ?? "", "http://localhost").searchParams.get("code");
				const cookie = secret ? editorCookie(secret, root, req.headers.host) : null;
				if (!cookie || !unlock.redeem(code))
					return refuse(res, "This link was already used or has expired — restart `astro dev`");
				res.statusCode = 302;
				res.setHeader(
					"Set-Cookie",
					`${cookie.name}=${cookie.value}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; SameSite=Strict`,
				);
				res.setHeader("Cache-Control", "no-store");
				res.setHeader("Location", base);
				res.end();
			});

			// The token, for the dev server's own pages in an enabled browser (never cached).
			server.middlewares.use(EDITOR_TOKEN_ENDPOINT, (req, res) => {
				if (req.method !== "GET") {
					res.setHeader("Allow", "GET");
					return send(res, 405, { error: "Method not allowed" });
				}
				const refused =
					refuseNonLocal(req) ??
					(isEnabledBrowser(req, secret, root) ? null : EDITOR_LOCKED_MESSAGE);
				if (refused) return refuse(res, refused);
				return send(res, 200, { token });
			});

			server.middlewares.use(EDITOR_ENDPOINT, async (req, res) => {
				try {
					if (req.method !== "GET" && req.method !== "POST") {
						res.setHeader("Allow", "GET, POST");
						return send(res, 405, { error: "Method not allowed" });
					}
					const refused = refuseEditorRequest(req, token, secret, root);
					if (refused) return refuse(res, refused);
					if (req.method === "GET") {
						const url = new URL(req.url ?? "", "http://localhost");
						const file = await editableSource(root, decksDir, url.searchParams.get("path"));
						if (!file) return send(res, 400, { error: "Not an editable slide source" });
						const content = await readFile(file, "utf-8");
						return send(res, 200, { path: url.searchParams.get("path"), content });
					}
					if (req.method === "POST") {
						const body = JSON.parse(await readBody(req)) as { path?: unknown; content?: unknown };
						const file = await editableSource(root, decksDir, body.path);
						if (!file || typeof body.content !== "string") {
							return send(res, 400, { error: "Not an editable slide source" });
						}
						track({ event: SOURCE_SAVED_EVENT, path: String(body.path) });
						await writeFile(file, body.content, "utf-8");
						return send(res, 200, { ok: true });
					}
					return send(res, 405, { error: "Method not allowed" });
				} catch (error) {
					// Details (paths included) go to the terminal, not to the page.
					server.config.logger.error(`[astlide] slide editor: ${(error as Error).message}`);
					return send(res, 500, {
						error: "Couldn't read or save the slide source (see the dev server log)",
					});
				}
			});
		},
	};
}
