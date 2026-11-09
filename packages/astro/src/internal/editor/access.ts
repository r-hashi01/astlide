/**
 * Who may use the slide editor's endpoint: local, same-origin requests with
 * the dev server's token, from a browser the developer enabled with the
 * one-time link `astro dev` prints.
 *
 * @module
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { dirname, join, resolve } from "node:path";
import { EDITOR_TOKEN_HEADER } from "@astlide/astro/internal/editor/protocol";

/** Start of the cookie marking an enabled browser (see {@link editorCookie}). */
export const EDITOR_COOKIE_PREFIX = "astlide-editor";

/** How long the link `astro dev` prints stays valid (it also works only once). */
export const UNLOCK_CODE_TTL_MS = 30 * 60 * 1000;

/** Shown by the editor when this browser hasn't been enabled. */
export const EDITOR_LOCKED_MESSAGE =
	"Editing is off in this browser — open the link printed by `astro dev` (restart it for a new one)";

/** A new random editor token (one per dev server start). */
export function createEditorToken(): string {
	return randomBytes(24).toString("hex");
}

/**
 * The project's editor secret: kept in `node_modules/.astro/` (owner-only),
 * created on first use and stable across restarts, so an enabled browser
 * stays enabled. Delete the file to reset it (every browser then needs a new
 * link). A file that is a symlink, isn't the user's or is readable by others
 * isn't trusted; then, as when it can't be stored, this dev server uses a
 * secret of its own.
 */
export function loadEditorSecret(root: string): string {
	const file = join(root, "node_modules", ".astro", "astlide-editor-secret");
	const read = (): string | undefined => {
		const info = lstatSync(file);
		if (!info.isFile()) return undefined;
		if (process.platform !== "win32") {
			if (typeof process.getuid === "function" && info.uid !== process.getuid()) return undefined;
			if (info.mode & 0o077) return undefined;
		}
		const saved = readFileSync(file, "utf-8").trim();
		return /^[0-9a-f]{64}$/.test(saved) ? saved : undefined;
	};
	try {
		return read() ?? randomBytes(32).toString("hex");
	} catch {
		// Not there yet.
	}
	const secret = randomBytes(32).toString("hex");
	try {
		mkdirSync(dirname(file), { recursive: true });
		// "wx": never through an existing file or link; if another dev server just made it, use theirs.
		writeFileSync(file, secret, { mode: 0o600, flag: "wx" });
		return secret;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "EEXIST") {
			try {
				return read() ?? secret;
			} catch {
				// Gone again: this run's secret.
			}
		}
		// Read-only project: this run's secret only.
		return secret;
	}
}

/**
 * The cookie of a browser enabled for this project on the port in `host`: its
 * name carries the project and the port (cookies are shared by every port of a
 * host), its value is derived from the secret and bound to the port — never
 * the secret itself.
 */
export function editorCookie(
	secret: string,
	root: string,
	host: string | undefined,
): { name: string; value: string } | null {
	let port: string;
	try {
		const url = new URL(`http://${host ?? ""}`);
		port = url.port || "80";
	} catch {
		return null;
	}
	const project = createHash("sha256").update(resolve(root)).digest("hex").slice(0, 12);
	return {
		name: `${EDITOR_COOKIE_PREFIX}-${project}-${port}`,
		value: createHmac("sha256", secret).update(`astlide-editor-cookie:${port}`).digest("hex"),
	};
}

/** One-time codes for the link `astro dev` prints: each works once, until it expires. */
export interface UnlockCodes {
	/** A new code. */
	issue(): string;
	/** Whether `code` is a live one; it can't be used again either way. */
	redeem(code: unknown): boolean;
}

export function createUnlockCodes(ttlMs = UNLOCK_CODE_TTL_MS, now = () => Date.now()): UnlockCodes {
	const live = new Map<string, number>();
	return {
		issue() {
			const code = randomBytes(16).toString("hex");
			live.set(code, now() + ttlMs);
			return code;
		},
		redeem(code) {
			let found: string | undefined;
			for (const [candidate, expires] of live) {
				if (expires <= now()) live.delete(candidate);
				else if (sameToken(code, candidate)) found = candidate;
			}
			if (found === undefined) return false;
			live.delete(found);
			return true;
		},
	};
}

/** A cookie's value from a request's `Cookie` header. */
export function cookieOf(req: Pick<IncomingMessage, "headers">, name: string): string | undefined {
	for (const part of (req.headers.cookie ?? "").split(";")) {
		const at = part.indexOf("=");
		if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
	}
	return undefined;
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

/** Whether this browser was enabled for this project and the port it's talking to. */
export function isEnabledBrowser(
	req: Pick<IncomingMessage, "headers">,
	secret: string,
	root: string,
): boolean {
	const cookie = secret ? editorCookie(secret, root, req.headers.host) : null;
	return !!cookie && sameToken(cookieOf(req, cookie.name), cookie.value);
}

function sameToken(given: unknown, token: string): boolean {
	if (typeof given !== "string") return false;
	const a = Buffer.from(given);
	const b = Buffer.from(token);
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Why an editor request is refused, or `null` when it may proceed: it must be
 * local and same-origin ({@link refuseNonLocal}), from a browser enabled with
 * the project's secret ({@link isEnabledBrowser}), and carry the dev server's token.
 */
export function refuseEditorRequest(
	req: EditorRequest,
	token: string,
	secret: string,
	root: string,
): string | null {
	const nonLocal = refuseNonLocal(req);
	if (nonLocal) return nonLocal;
	if (!isEnabledBrowser(req, secret, root)) return EDITOR_LOCKED_MESSAGE;
	if (!sameToken(req.headers[EDITOR_TOKEN_HEADER], token)) return "Missing or wrong editor token";
	return null;
}
