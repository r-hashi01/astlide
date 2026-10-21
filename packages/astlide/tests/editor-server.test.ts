import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
	astlideEditorPlugin,
	DECK_CHANGED_EVENT,
	EDITOR_TOKEN_HEADER,
	interceptReloads,
	isLoopback,
	isSameOrigin,
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
const request = (
	method: string,
	headers: Record<string, string>,
	remoteAddress: string | undefined = "127.0.0.1",
) => ({ method, headers, socket: { remoteAddress } });
const local = { host: "localhost:4321", [EDITOR_TOKEN_HEADER]: TOKEN };

describe("isLoopback", () => {
	it("accepts only this machine", () => {
		for (const a of ["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1"])
			expect(isLoopback(a)).toBe(true);
		for (const a of ["192.168.1.5", "::ffff:10.0.0.1", "fe80::1", "", undefined])
			expect(isLoopback(a)).toBe(false);
	});
});

describe("refuseEditorRequest", () => {
	it("allows the dev page's own requests", () => {
		expect(refuseEditorRequest(request("GET", local), TOKEN)).toBeNull();
		expect(
			refuseEditorRequest(request("GET", { ...local, "sec-fetch-site": "same-origin" }), TOKEN),
		).toBeNull();
		expect(
			refuseEditorRequest(request("POST", { ...local, origin: "http://localhost:4321" }), TOKEN),
		).toBeNull();
	});

	it("refuses requests from other machines, even with the right headers", () => {
		const headers = { ...local, origin: "http://192.168.1.5:4321", host: "192.168.1.5:4321" };
		expect(refuseEditorRequest(request("POST", headers, "192.168.1.20"), TOKEN)).toMatch(
			/this machine/,
		);
		expect(refuseEditorRequest(request("GET", headers, "192.168.1.20"), TOKEN)).toMatch(
			/this machine/,
		);
	});

	it("refuses a missing or wrong token", () => {
		const { [EDITOR_TOKEN_HEADER]: _, ...noToken } = local;
		expect(refuseEditorRequest(request("GET", noToken), TOKEN)).toMatch(/token/);
		expect(
			refuseEditorRequest(request("GET", { ...local, [EDITOR_TOKEN_HEADER]: "nope" }), TOKEN),
		).toMatch(/token/);
	});

	it("refuses other origins", () => {
		expect(refuseEditorRequest(request("POST", local), TOKEN)).toMatch(/Cross-origin/);
		expect(
			refuseEditorRequest(request("GET", { ...local, origin: "http://localhost:5173" }), TOKEN),
		).toMatch(/Cross-origin/);
		expect(
			refuseEditorRequest(request("GET", { ...local, "sec-fetch-site": "same-site" }), TOKEN),
		).toMatch(/Cross-origin/);
	});
});

describe("editor endpoint", () => {
	type Handler = (req: unknown, res: unknown) => Promise<void>;
	function endpoint(projectRoot: string): Handler {
		let handler: Handler | undefined;
		const plugin = astlideEditorPlugin(projectRoot, TOKEN);
		const server = {
			ws: { send() {} },
			environments: {},
			watcher: { on() {} },
			middlewares: { use: (_: string, fn: Handler) => (handler = fn) },
		};
		(plugin.configureServer as (s: unknown) => void)(server);
		return handler as Handler;
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
		await new Promise<void>((done) => {
			const res = {
				set statusCode(v: number) {
					status = v;
				},
				setHeader() {},
				end(body: string) {
					text = body;
					done();
				},
			};
			void handler(req, res);
		});
		return { status, body: JSON.parse(text) as Record<string, unknown> };
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
		expect(read).toEqual({
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
});
