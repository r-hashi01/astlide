import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
	astlideEditorPlugin,
	createUnlockCodes,
	DECK_CHANGED_EVENT,
	EDITOR_ENDPOINT,
	EDITOR_TOKEN_ENDPOINT,
	EDITOR_TOKEN_HEADER,
	EDITOR_UNLOCK_ENDPOINT,
	editorCookie,
	interceptReloads,
	isLoopback,
	isLoopbackHost,
	isSameOrigin,
	loadEditorSecret,
	refuseEditorRequest,
	resolveSlideSource,
	SOURCE_SAVED_EVENT,
} from "../src/internal/editor-server";

const root = resolve("/project");

describe("resolveSlideSource", () => {
	it("accepts slide sources under src/", () => {
		expect(resolveSlideSource(root, "src/content/decks/talk/01-cover.mdx")).toBe(
			join(root, "src/content/decks/talk/01-cover.mdx"),
		);
		expect(resolveSlideSource(root, "src/content/decks/talk/02.md")).not.toBeNull();
		expect(resolveSlideSource(root, "src/content/decks/talk/03.html")).not.toBeNull();
	});

	it("rejects other extensions", () => {
		expect(resolveSlideSource(root, "src/content.config.ts")).toBeNull();
		expect(resolveSlideSource(root, "src/content/decks/talk/_config.json")).toBeNull();
	});

	it("rejects paths outside src/", () => {
		expect(resolveSlideSource(root, "README.md")).toBeNull();
		expect(resolveSlideSource(root, "src/../README.md")).toBeNull();
		expect(resolveSlideSource(root, "src/content/../../docs/x.md")).toBeNull();
		expect(resolveSlideSource(root, "/etc/passwd.md")).toBeNull();
		expect(resolveSlideSource(root, "D:\\x.md")).toBeNull();
		expect(resolveSlideSource(root, "C:/Users/x/notes.md")).toBeNull();
	});

	it("rejects non-strings and NUL bytes", () => {
		expect(resolveSlideSource(root, undefined)).toBeNull();
		expect(resolveSlideSource(root, 42)).toBeNull();
		expect(resolveSlideSource(root, "src/a\0.md")).toBeNull();
	});
});

describe("isSameOrigin", () => {
	it("allows the dev server's own origin", () => {
		expect(
			isSameOrigin({ headers: { origin: "http://localhost:4321", host: "localhost:4321" } }),
		).toBe(true);
	});

	it("refuses other origins or a missing Origin header", () => {
		expect(
			isSameOrigin({ headers: { origin: "https://evil.example", host: "localhost:4321" } }),
		).toBe(false);
		expect(isSameOrigin({ headers: { host: "localhost:4321" } })).toBe(false);
		expect(isSameOrigin({ headers: { origin: "not a url", host: "localhost:4321" } })).toBe(false);
	});
});

describe("interceptReloads", () => {
	function channel() {
		const sent: unknown[] = [];
		return { sent, send: (payload: unknown) => sent.push(payload) };
	}

	it("turns each reload after an editor write into a source-saved event", () => {
		const ch = channel();
		const write = { event: SOURCE_SAVED_EVENT, path: "src/content/decks/t/01.mdx" };
		interceptReloads(ch, () => write);
		ch.send({ type: "full-reload", path: "*" });
		ch.send({ type: "full-reload" });
		const event = {
			type: "custom",
			event: SOURCE_SAVED_EVENT,
			data: { path: "src/content/decks/t/01.mdx" },
		};
		expect(ch.sent).toEqual([{ ...event, data: { ...event.data, committed: true } }, event]);
	});

	it("turns the reload after a slide file is removed into a deck-changed event", () => {
		const ch = channel();
		interceptReloads(ch, () => ({
			event: DECK_CHANGED_EVENT,
			path: "src/content/decks/t/02.mdx",
			removed: true,
		}));
		ch.send({ type: "full-reload" });
		ch.send({ type: "full-reload", path: "*" });
		const data = { path: "src/content/decks/t/02.mdx", removed: true };
		expect(ch.sent).toEqual([
			{ type: "custom", event: DECK_CHANGED_EVENT, data },
			// The content store's reload: the change is committed.
			{ type: "custom", event: DECK_CHANGED_EVENT, data: { ...data, committed: true } },
		]);
	});

	it("passes reloads through when no editor write is pending", () => {
		const ch = channel();
		interceptReloads(ch, () => null);
		ch.send({ type: "full-reload" });
		ch.send({ type: "update", updates: [] });
		expect(ch.sent).toEqual([{ type: "full-reload" }, { type: "update", updates: [] }]);
	});

	it("never swallows non-reload messages", () => {
		const ch = channel();
		interceptReloads(ch, () => ({ event: SOURCE_SAVED_EVENT, path: "x.mdx" }));
		ch.send({ type: "update", updates: [] });
		expect(ch.sent).toEqual([{ type: "update", updates: [] }]);
	});
});

const TOKEN = "t".repeat(48);
const SECRET = "5".repeat(64);
/** The cookie of a browser enabled through the printed link, for a project and port. */
function cookieFor(dir: string, host = "localhost:4321"): string {
	const cookie = editorCookie(SECRET, dir, host);
	if (!cookie) throw new Error(`no cookie for ${host}`);
	return `${cookie.name}=${cookie.value}`;
}
const ENABLED = cookieFor(root);
const request = (
	method: string,
	headers: Record<string, string>,
	remoteAddress: string | undefined = "127.0.0.1",
) => ({ method, headers, socket: { remoteAddress } });
const local = { host: "localhost:4321", cookie: ENABLED, [EDITOR_TOKEN_HEADER]: TOKEN };

describe("isLoopback", () => {
	it("accepts only this machine", () => {
		for (const a of ["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1"])
			expect(isLoopback(a)).toBe(true);
		for (const a of ["192.168.1.5", "::ffff:10.0.0.1", "fe80::1", "", undefined])
			expect(isLoopback(a)).toBe(false);
	});
});

describe("isLoopbackHost", () => {
	it("accepts only names of this machine", () => {
		for (const h of [
			"localhost",
			"localhost:4321",
			"app.localhost:4321",
			"127.0.0.1:4321",
			"[::1]:4321",
			"LOCALHOST",
		])
			expect(isLoopbackHost(h)).toBe(true);
		for (const h of [
			"192.168.1.5:4321",
			"abc.ngrok.app",
			"localhost.evil.com",
			"127.0.0.1.nip.io",
			"",
			undefined,
		])
			expect(isLoopbackHost(h)).toBe(false);
	});
});

describe("refuseEditorRequest", () => {
	it("allows the dev page's own requests", () => {
		expect(refuseEditorRequest(request("GET", local), TOKEN, SECRET, root)).toBeNull();
		expect(
			refuseEditorRequest(
				request("GET", { ...local, "sec-fetch-site": "same-origin" }),
				TOKEN,
				SECRET,
				root,
			),
		).toBeNull();
		expect(
			refuseEditorRequest(
				request("POST", { ...local, origin: "http://localhost:4321" }),
				TOKEN,
				SECRET,
				root,
			),
		).toBeNull();
	});

	it("refuses requests from other machines, even with the right headers", () => {
		const headers = { ...local, origin: "http://192.168.1.5:4321", host: "192.168.1.5:4321" };
		expect(
			refuseEditorRequest(request("POST", headers, "192.168.1.20"), TOKEN, SECRET, root),
		).toMatch(/this machine/);
		expect(
			refuseEditorRequest(request("GET", headers, "192.168.1.20"), TOKEN, SECRET, root),
		).toMatch(/this machine/);
	});

	it("refuses a missing or wrong token", () => {
		const { [EDITOR_TOKEN_HEADER]: _, ...noToken } = local;
		expect(refuseEditorRequest(request("GET", noToken), TOKEN, SECRET, root)).toMatch(/token/);
		expect(
			refuseEditorRequest(
				request("GET", { ...local, [EDITOR_TOKEN_HEADER]: "nope" }),
				TOKEN,
				SECRET,
				root,
			),
		).toMatch(/token/);
	});

	it("refuses a browser that wasn't enabled, whatever else matches", () => {
		// What a raw TCP relay (ssh -R) can send: loopback, localhost, same origin, the token.
		const { cookie: _, ...relayed } = local;
		expect(refuseEditorRequest(request("GET", relayed), TOKEN, SECRET, root)).toMatch(
			/link printed/,
		);
		expect(
			refuseEditorRequest(
				request("POST", { ...relayed, origin: "http://localhost:4321" }),
				TOKEN,
				SECRET,
				root,
			),
		).toMatch(/link printed/);
		// A forged cookie, or the secret itself as the cookie.
		const name = ENABLED.split("=")[0];
		for (const cookie of [`${name}=nope`, `${name}=${SECRET}`, "other=1"])
			expect(
				refuseEditorRequest(request("GET", { ...relayed, cookie }), TOKEN, SECRET, root),
			).toMatch(/link printed/);
		// No secret (never the case in dev): nothing counts as enabled.
		expect(refuseEditorRequest(request("GET", local), TOKEN, "", root)).toMatch(/link printed/);
	});

	it("ties the cookie to the project and the port", () => {
		// Cookies are shared by every port of a host: another dev server's cookie doesn't count…
		const otherPort = { ...local, host: "localhost:5173" };
		expect(refuseEditorRequest(request("GET", otherPort), TOKEN, SECRET, root)).toMatch(
			/link printed/,
		);
		expect(
			refuseEditorRequest(
				request("GET", { ...otherPort, cookie: cookieFor(root, "localhost:5173") }),
				TOKEN,
				SECRET,
				root,
			),
		).toBeNull();
		// …nor another project's.
		expect(
			refuseEditorRequest(
				request("GET", { ...local, cookie: cookieFor(resolve("/other")) }),
				TOKEN,
				SECRET,
				root,
			),
		).toMatch(/link printed/);
	});

	it("refuses requests relayed by a tunnel or proxy, though they arrive over loopback", () => {
		// A tunnel client runs on this machine: loopback socket, its own host name.
		const tunnel = { ...local, host: "abc.ngrok.app", origin: "https://abc.ngrok.app" };
		expect(refuseEditorRequest(request("POST", tunnel), TOKEN, SECRET, root)).toMatch(
			/this machine/,
		);
		expect(refuseEditorRequest(request("GET", tunnel), TOKEN, SECRET, root)).toMatch(
			/this machine/,
		);
		// …or one that rewrites Host to localhost but says it forwarded the request.
		for (const header of [
			"x-forwarded-for",
			"x-forwarded-host",
			"forwarded",
			"x-real-ip",
			"cf-connecting-ip",
			"ngrok-trace-id",
			"via",
		])
			expect(
				refuseEditorRequest(request("GET", { ...local, [header]: "1.2.3.4" }), TOKEN, SECRET, root),
			).toMatch(/this machine/);
	});

	it("refuses an origin that isn't a loopback name", () => {
		expect(
			refuseEditorRequest(
				request("POST", { ...local, host: "localhost:4321", origin: "http://evil.example" }),
				TOKEN,
				SECRET,
				root,
			),
		).toMatch(/Cross-origin/);
	});

	it("refuses other origins", () => {
		expect(refuseEditorRequest(request("POST", local), TOKEN, SECRET, root)).toMatch(
			/Cross-origin/,
		);
		expect(
			refuseEditorRequest(
				request("GET", { ...local, origin: "http://localhost:5173" }),
				TOKEN,
				SECRET,
				root,
			),
		).toMatch(/Cross-origin/);
		expect(
			refuseEditorRequest(
				request("GET", { ...local, "sec-fetch-site": "same-site" }),
				TOKEN,
				SECRET,
				root,
			),
		).toMatch(/Cross-origin/);
	});
});

describe("editor endpoint", () => {
	type Handler = (req: unknown, res: unknown) => Promise<void> | void;
	function endpoint(
		projectRoot: string,
		path = EDITOR_ENDPOINT,
		codes = createUnlockCodes(),
	): Handler {
		const handlers = new Map<string, Handler>();
		const plugin = astlideEditorPlugin(projectRoot, TOKEN, SECRET, "/slides/", codes);
		const server = {
			ws: { send() {} },
			environments: {},
			watcher: { on() {} },
			middlewares: { use: (at: string, fn: Handler) => handlers.set(at, fn) },
		};
		(plugin.configureServer as (s: unknown) => void)(server);
		const handler = handlers.get(path) as Handler;
		// The shared headers carry the enabled cookie for `root`; use this project's.
		return (req, res) => {
			const r = req as { headers: Record<string, string> };
			if (r.headers.cookie === ENABLED)
				r.headers = { ...r.headers, cookie: cookieFor(projectRoot) };
			return handler(req, res);
		};
	}
	async function call(
		handler: Handler,
		method: string,
		headers: Record<string, string>,
		options: { url?: string; body?: unknown; remoteAddress?: string } = {},
	) {
		const req = Object.assign(
			Readable.from(options.body === undefined ? [] : [Buffer.from(JSON.stringify(options.body))]),
			{
				method,
				url: options.url ?? "/",
				headers,
				socket: { remoteAddress: options.remoteAddress ?? "127.0.0.1" },
			},
		);
		let status = 0;
		let text = "";
		const sent: Record<string, string> = {};
		await new Promise<void>((done) => {
			const res = {
				set statusCode(v: number) {
					status = v;
				},
				setHeader(name: string, value: string) {
					sent[name.toLowerCase()] = value;
				},
				end(body = "") {
					text = body;
					done();
				},
			};
			void handler(req, res);
		});
		return {
			status,
			body: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
			headers: sent,
		};
	}
	function project() {
		const dir = mkdtempSync(join(tmpdir(), "astlide-editor-"));
		mkdirSync(join(dir, "src", "content", "decks", "talk"), { recursive: true });
		writeFileSync(join(dir, "src", "content", "decks", "talk", "01.md"), "# Hi");
		return dir;
	}
	const post = { ...local, origin: "http://localhost:4321" };

	it("reads and writes slide sources for the dev page", async () => {
		const dir = project();
		const handler = endpoint(dir);
		const read = await call(handler, "GET", local, {
			url: "/?path=src/content/decks/talk/01.md",
		});
		expect(read).toMatchObject({
			status: 200,
			body: { path: "src/content/decks/talk/01.md", content: "# Hi" },
		});
		const write = await call(handler, "POST", post, {
			body: { path: "src/content/decks/talk/01.md", content: "# Bye" },
		});
		expect(write.status).toBe(200);
		expect(readFileSync(join(dir, "src/content/decks/talk/01.md"), "utf-8")).toBe("# Bye");
	});

	it("refuses requests without the token or from another machine", async () => {
		const dir = project();
		const handler = endpoint(dir);
		const { [EDITOR_TOKEN_HEADER]: _, ...noToken } = post;
		const body = { path: "src/content/decks/talk/01.md", content: "pwned" };
		expect((await call(handler, "POST", noToken, { body })).status).toBe(403);
		expect((await call(handler, "POST", post, { body, remoteAddress: "10.0.0.7" })).status).toBe(
			403,
		);
		expect(
			(await call(handler, "GET", noToken, { url: "/?path=src/content/decks/talk/01.md" })).status,
		).toBe(403);
		expect(readFileSync(join(dir, "src/content/decks/talk/01.md"), "utf-8")).toBe("# Hi");
	});

	it("hands the token to the dev server's own pages only", async () => {
		const handler = endpoint(project(), EDITOR_TOKEN_ENDPOINT);
		const { [EDITOR_TOKEN_HEADER]: _, ...page } = local;
		expect(await call(handler, "GET", { ...page, "sec-fetch-site": "same-origin" })).toMatchObject({
			status: 200,
			body: { token: TOKEN },
		});
		// A browser that wasn't enabled through the printed link.
		const { cookie: _c, ...notEnabled } = page;
		expect(await call(handler, "GET", notEnabled)).toMatchObject({
			status: 403,
			body: { locked: true },
		});
		// Another localhost app (Vite would otherwise answer it with CORS headers).
		expect(
			(
				await call(handler, "GET", {
					...page,
					origin: "http://localhost:3000",
					"sec-fetch-site": "same-site",
				})
			).status,
		).toBe(403);
		// A tunnel, another machine, a relayed request.
		expect((await call(handler, "GET", { ...page, host: "abc.ngrok.app" })).status).toBe(403);
		expect((await call(handler, "GET", page, { remoteAddress: "192.168.1.20" })).status).toBe(403);
		expect((await call(handler, "GET", { ...page, "x-forwarded-for": "1.2.3.4" })).status).toBe(
			403,
		);
		expect((await call(handler, "POST", page)).status).toBe(405);
	});

	it("doesn't follow a symlink out of src/", async () => {
		const dir = project();
		const outside = mkdtempSync(join(tmpdir(), "astlide-outside-"));
		writeFileSync(join(outside, "secret.md"), "secret");
		symlinkSync(outside, join(dir, "src", "linked"));
		const handler = endpoint(dir);
		const read = await call(handler, "GET", local, { url: "/?path=src/linked/secret.md" });
		expect(read.status).toBe(400);
		const write = await call(handler, "POST", post, {
			body: { path: "src/linked/new.md", content: "x" },
		});
		expect(write.status).toBe(400);
	});

	it("only edits slide files that already exist in the decks folder", async () => {
		const dir = project();
		mkdirSync(join(dir, "src", "pages"), { recursive: true });
		writeFileSync(join(dir, "src", "pages", "about.md"), "# About");
		const handler = endpoint(dir);
		for (const path of [
			"src/content/decks/talk/02-new.mdx", // a new file
			"src/pages/x.mdx", // a page: code that runs on the server
			"src/pages/about.md", // an existing file outside the decks
			"src/content/decks/talk/01.mdx", // another extension of an existing slide
		]) {
			const write = await call(handler, "POST", post, { body: { path, content: "x" } });
			expect(write.status, path).toBe(400);
			expect(existsSync(join(dir, path)) && path !== "src/pages/about.md", path).toBe(false);
		}
		expect(readFileSync(join(dir, "src", "pages", "about.md"), "utf-8")).toBe("# About");
		const read = await call(handler, "GET", local, { url: "/?path=src/pages/about.md" });
		expect(read.status).toBe(400);
	});

	it("refuses a browser that wasn't enabled, though everything else matches", async () => {
		const dir = project();
		const handler = endpoint(dir);
		const { cookie: _, ...relayed } = post;
		const body = { path: "src/content/decks/talk/01.md", content: "pwned" };
		expect(await call(handler, "POST", relayed, { body })).toMatchObject({
			status: 403,
			body: { locked: true },
		});
		expect(readFileSync(join(dir, "src/content/decks/talk/01.md"), "utf-8")).toBe("# Hi");
	});

	it("enables a browser through a one-time link", async () => {
		const dir = project();
		const codes = createUnlockCodes();
		const unlock = endpoint(dir, EDITOR_UNLOCK_ENDPOINT, codes);
		const page = { host: "localhost:4321", "sec-fetch-site": "none" };
		const code = codes.issue();
		const ok = await call(unlock, "GET", page, { url: `/?code=${code}` });
		expect(ok.status).toBe(302);
		expect(ok.headers.location).toBe("/slides/");
		const cookie = ok.headers["set-cookie"] ?? "";
		expect(cookie).toMatch(/HttpOnly/);
		expect(cookie).toMatch(/SameSite=Strict/);
		expect(cookie.startsWith(`${cookieFor(dir)};`)).toBe(true);
		// The cookie is derived from the secret, not the secret.
		expect(cookie).not.toContain(SECRET);
		// The code works once.
		expect((await call(unlock, "GET", page, { url: `/?code=${code}` })).status).toBe(403);
		// The secret itself, a wrong or missing code, another machine, a tunnel.
		expect((await call(unlock, "GET", page, { url: `/?code=${SECRET}` })).status).toBe(403);
		expect((await call(unlock, "GET", page, { url: "/?code=nope" })).status).toBe(403);
		expect((await call(unlock, "GET", page, { url: "/" })).status).toBe(403);
		const fresh = codes.issue();
		expect(
			(await call(unlock, "GET", page, { url: `/?code=${fresh}`, remoteAddress: "10.0.0.7" }))
				.status,
		).toBe(403);
		expect(
			(await call(unlock, "GET", { ...page, host: "abc.ngrok.app" }, { url: `/?code=${fresh}` }))
				.status,
		).toBe(403);
	});
});

describe("createUnlockCodes", () => {
	it("hands out codes that work once and expire", () => {
		let now = 0;
		const codes = createUnlockCodes(1000, () => now);
		const a = codes.issue();
		const b = codes.issue();
		expect(a).not.toBe(b);
		expect(codes.redeem(a)).toBe(true);
		expect(codes.redeem(a)).toBe(false);
		now = 1000;
		expect(codes.redeem(b)).toBe(false);
		expect(codes.redeem(undefined)).toBe(false);
	});
});

describe("loadEditorSecret", () => {
	it("keeps one owner-only secret per project across restarts", () => {
		const dir = mkdtempSync(join(tmpdir(), "astlide-secret-"));
		const first = loadEditorSecret(dir);
		expect(first).toMatch(/^[0-9a-f]{64}$/);
		expect(loadEditorSecret(dir)).toBe(first);
		const file = join(dir, "node_modules", ".astro", "astlide-editor-secret");
		expect(statSync(file).mode & 0o777).toBe(0o600);
		// An enabled browser stays enabled after a restart (new per-start token, same secret).
		expect(editorCookie(loadEditorSecret(dir), dir, "localhost:4321")).toEqual(
			editorCookie(first, dir, "localhost:4321"),
		);
	});

	it.skipIf(process.platform === "win32")(
		"doesn't trust a secret file that is a link or readable by others",
		() => {
			const dir = mkdtempSync(join(tmpdir(), "astlide-secret-"));
			const store = join(dir, "node_modules", ".astro");
			mkdirSync(store, { recursive: true });
			const planted = join(dir, "planted");
			writeFileSync(planted, "a".repeat(64), { mode: 0o600 });
			symlinkSync(planted, join(store, "astlide-editor-secret"));
			expect(loadEditorSecret(dir)).not.toBe("a".repeat(64));
			// Never written through the link either.
			expect(readFileSync(planted, "utf-8")).toBe("a".repeat(64));

			const open = mkdtempSync(join(tmpdir(), "astlide-secret-"));
			mkdirSync(join(open, "node_modules", ".astro"), { recursive: true });
			const file = join(open, "node_modules", ".astro", "astlide-editor-secret");
			writeFileSync(file, "b".repeat(64));
			chmodSync(file, 0o644);
			expect(loadEditorSecret(open)).not.toBe("b".repeat(64));
		},
	);
});
