import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTemplateStore } from "@astlide/core/templates";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHandler, readBody } from "../src/app";
import { resolveOptions, type ServerOptions } from "../src/config";
import { deckFixture, templateFixture } from "./fixtures";

let options: ServerOptions;
let handle: (req: Request) => Promise<Response>;
let template: Uint8Array<ArrayBuffer>;
let deck: Uint8Array<ArrayBuffer>;

beforeAll(async () => {
	options = resolveOptions({});
	handle = createHandler(options);
	[template, deck] = await Promise.all([templateFixture(), deckFixture()]);
});

const post = (path: string, body: BodyInit, headers: Record<string, string> = {}) =>
	handle(new Request(`http://test${path}`, { method: "POST", body, headers }));
const postJson = (path: string, body: unknown) =>
	post(path, JSON.stringify(body), { "content-type": "application/json" });
const form = (fields: Record<string, string | Blob>, filename = "file.pptx") => {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields))
		if (typeof value === "string") data.append(key, value);
		else data.append(key, value, filename);
	return data;
};

describe("routes", () => {
	it("answers /health and the OpenAPI spec with this server's URL", async () => {
		const health = await handle(new Request("http://test/health"));
		expect(await health.json()).toMatchObject({ status: "ok", queue: { running: 0, waiting: 0 } });
		const spec = await (await handle(new Request("http://example.com:8080/openapi.json"))).json();
		expect(spec.openapi).toBe("3.1.0");
		expect(spec.servers).toEqual([{ url: "http://example.com:8080" }]);
		expect(Object.keys(spec.paths)).toEqual(
			expect.arrayContaining(["/render", "/import", "/templates/layouts", "/health"]),
		);
	});

	it("answers unknown paths, wrong methods and content types with errors", async () => {
		expect((await handle(new Request("http://test/nope"))).status).toBe(404);
		expect((await handle(new Request("http://test/render"))).status).toBe(405);
		expect((await post("/render", "x", { "content-type": "text/plain" })).status).toBe(415);
		const bad = await post("/render", "{", { "content-type": "application/json" });
		expect(bad.status).toBe(400);
		expect((await bad.json()).error).toMatch(/JSON/);
	});

	it("handles long URL paths in linear time, refusing very long ones", async () => {
		// A regex like /\/+$/ takes seconds on this; it is read before the API key is checked.
		const started = performance.now();
		const slashes = await handle(new Request(`http://test/${"/".repeat(2000)}a`));
		expect(slashes.status).toBe(404);
		const long = await handle(new Request(`http://test/${"/".repeat(100_000)}a`));
		expect(long.status).toBe(414);
		expect(performance.now() - started).toBeLessThan(200);
	});

	it("gives up on a body that arrives too slowly", async () => {
		// A body that never finishes: one chunk, then nothing.
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([123]));
			},
		});
		const req = new Request("http://test/render", {
			method: "POST",
			body,
			duplex: "half",
		} as RequestInit);
		await expect(readBody(req, 1000, 50)).rejects.toMatchObject({ status: 408 });
	});

	it("refuses bodies over the limit", async () => {
		const small = createHandler({ ...options, maxBodyBytes: 10 });
		const res = await small(
			new Request("http://test/render", {
				method: "POST",
				body: JSON.stringify({ markdown: "# a long enough body" }),
				headers: { "content-type": "application/json" },
			}),
		);
		expect(res.status).toBe(413);
	});

	it("checks the API key when one is set", async () => {
		const locked = createHandler({ ...options, apiKey: "secret" });
		const req = (headers: Record<string, string>) =>
			locked(
				new Request("http://test/templates/layouts", {
					method: "POST",
					body: "{}",
					headers: { "content-type": "application/json", ...headers },
				}),
			);
		expect((await req({})).status).toBe(401);
		expect((await req({ authorization: "Bearer wrong" })).status).toBe(401);
		// Authorized: on to validation (no file sent).
		expect((await req({ authorization: "Bearer secret" })).status).toBe(400);
		expect((await req({ "x-api-key": "secret" })).status).toBe(400);
		expect((await locked(new Request("http://test/health"))).status).toBe(200);
		// Without the key, not even which routes exist.
		expect((await locked(new Request("http://test/nope"))).status).toBe(401);
		expect((await locked(new Request("http://test/render"))).status).toBe(401);
		expect((await req({ authorization: "Bearer secret-and-more" })).status).toBe(401);
	});

	it("refuses uploads beyond the queue's room before reading them", async () => {
		const tight = createHandler({ ...options, concurrency: 1, maxQueued: 0 });
		// A client that never finishes sending its body holds the only slot.
		const stalled = tight(
			new Request("http://test/import", {
				method: "POST",
				body: new ReadableStream({ start() {} }),
				headers: { "content-type": "application/json" },
				duplex: "half",
			} as RequestInit),
		);
		const res = await tight(
			new Request("http://test/render", {
				method: "POST",
				body: JSON.stringify({ markdown: "# A" }),
				headers: { "content-type": "application/json" },
			}),
		);
		expect(res.status).toBe(503);
		void stalled;
	});
});

describe("POST /render validation", () => {
	it("refuses bad input before building anything", async () => {
		const cases: [unknown, RegExp][] = [
			[{}, /markdown/],
			[{ markdown: "# a", format: "docx" }, /format/],
			[{ markdown: "# a", theme: "neon" }, /theme/],
			[{ markdown: "# a", output: "url" }, /output/],
			[{ slides: [{ markdown: "# a", frontmatter: { hidden: "no" } }] }, /hidden/],
			[{ markdown: "# a", template: { filename: "t.docx", data: "UEsDBA==" } }, /template/],
		];
		for (const [body, message] of cases) {
			const res = await postJson("/render", body);
			expect(res.status, JSON.stringify(body)).toBe(400);
			expect((await res.json()).error).toMatch(message);
		}
	});

	it("limits the number of slides", async () => {
		const few = createHandler({ ...options, maxSlides: 2 });
		const res = await few(
			new Request("http://test/render", {
				method: "POST",
				body: JSON.stringify({ slides: ["# 1", "# 2", "# 3"] }),
				headers: { "content-type": "application/json" },
			}),
		);
		expect(res.status).toBe(400);
		expect((await res.json()).error).toMatch(/at most 2/);
	});
});

describe("POST /templates/layouts", () => {
	it("lists an uploaded template's layouts and placeholders (multipart)", async () => {
		const res = await post("/templates/layouts", form({ file: new Blob([template]) }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.fonts).toEqual({ heading: "Georgia", body: "Helvetica" });
		expect(body.aliases).toMatchObject({ cover: "title-slide", default: "title-and-content" });
		const content = body.layouts.find((l: { id: string }) => l.id === "title-and-content");
		expect(content).toMatchObject({
			name: "Title and Content",
			title: { left: 72, top: 72, width: 1728, height: 144 },
			body: [{ left: 72, top: 252 }],
		});
		expect(content.slideNumber).not.toBeNull();
		// The outline only: no artwork / CSS.
		expect(JSON.stringify(body)).not.toMatch(/background:|font-size/);
	});

	it("takes the template as base64 JSON too, and refuses other files", async () => {
		const res = await postJson("/templates/layouts", {
			file: { filename: "brand.potx", data: Buffer.from(template).toString("base64") },
		});
		expect(res.status).toBe(200);
		expect((await res.json()).layouts.length).toBeGreaterThan(1);
		const bad = await postJson("/templates/layouts", { file: { data: "aGVsbG8=" } });
		expect(bad.status).toBe(400);
	});
});

describe("POST /import", () => {
	it("returns the slides as HTML with titles, notes and inlined pictures", async () => {
		const res = await post("/import", form({ file: new Blob([deck]) }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toMatchObject({ title: "Fixture deck", author: "Astlide" });
		expect(body.slides).toHaveLength(2);
		expect(body.slides[0]).toMatchObject({ index: 1, title: "Imported title", notes: "Say hello" });
		expect(body.slides[0].html).toContain("First point");
		expect(body.slides[1].html).toContain("data:image/png;base64,");
	});

	it("only fetches Google Slides URLs", async () => {
		const res = await postJson("/import", { url: "http://169.254.169.254/latest" });
		expect(res.status).toBe(400);
		expect((await res.json()).error).toMatch(/Google Slides/);
		expect((await postJson("/import", {})).status).toBe(400);
	});
});

describe("uploaded PowerPoint files are read in a child process", () => {
	it("stops a read that takes too long (504)", async () => {
		const slow = createHandler({ ...options, renderTimeoutMs: 1 });
		const res = await slow(
			new Request("http://test/import", { method: "POST", body: form({ file: new Blob([deck]) }) }),
		);
		expect(res.status).toBe(504);
		// The server itself keeps answering.
		expect((await slow(new Request("http://test/health"))).status).toBe(200);
	});

	it("refuses an answer larger than the output limit (422)", async () => {
		const small = createHandler({ ...options, maxOutputBytes: 64 });
		const res = await small(
			new Request("http://test/templates/layouts", {
				method: "POST",
				body: form({ file: new Blob([template]) }),
			}),
		);
		expect(res.status).toBe(422);
		expect((await res.json()).error).toMatch(/larger than/);
	});
});

describe("stored templates", () => {
	let dir: string;
	let stored: (req: Request) => Promise<Response>;
	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), "astlide-server-templates-"));
		stored = createHandler({ ...options, templates: createTemplateStore(dir) });
	});
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	const call = (path: string, init?: RequestInit) =>
		stored(new Request(`http://test${path}`, init));
	const upload = (fields: Record<string, string | Blob>, filename?: string) =>
		call("/templates", { method: "POST", body: form(fields, filename) });

	it("are off without ASTLIDE_TEMPLATE_STORE", async () => {
		const res = await handle(new Request("http://test/templates"));
		expect(res.status).toBe(404);
		expect((await res.json()).error).toMatch(/ASTLIDE_TEMPLATE_STORE/);
		const render = await postJson("/render", { markdown: "# a", template: "acme" });
		expect(render.status).toBe(404);
	});

	it("keeps uploads as versions, with their layouts", async () => {
		const first = await upload(
			{ name: "acme", label: "Acme", file: new Blob([template]) },
			"acme.potx",
		);
		expect(first.status).toBe(201);
		expect(await first.json()).toMatchObject({
			name: "acme",
			label: "Acme",
			latest: 1,
			versions: [{ version: 1, ext: ".potx", size: template.length }],
		});
		const second = await upload({ name: "acme", file: new Blob([template]) });
		expect(second.status).toBe(200);
		expect((await second.json()).latest).toBe(2);

		const list = await (await call("/templates")).json();
		expect(list.templates.map((t: { name: string }) => t.name)).toEqual(["acme"]);
		expect(JSON.stringify(list)).not.toContain("outline");

		const one = await (await call("/templates/acme")).json();
		expect(one).toMatchObject({ name: "acme", label: "Acme", version: 2 });
		expect(one.outline.aliases).toMatchObject({ cover: "title-slide" });
		expect((await (await call("/templates/acme?version=1")).json()).version).toBe(1);

		const file = await call("/templates/acme/file?version=1");
		expect(file.headers.get("content-type")).toContain("presentationml.template");
		expect(file.headers.get("content-disposition")).toContain("acme-v1.potx");
		expect(new Uint8Array(await file.arrayBuffer())).toEqual(template);
	});

	it("reads the layouts of a template stored without them (e.g. by the CLI)", async () => {
		await createTemplateStore(dir).put("from-cli", template, { ext: ".pptx" });
		const res = await call("/templates/from-cli");
		expect(res.status).toBe(200);
		expect((await res.json()).outline.aliases).toMatchObject({ cover: "title-slide" });
	});

	it("deletes a version, then the template", async () => {
		await upload({ name: "gone", file: new Blob([template]) });
		await upload({ name: "gone", file: new Blob([template]) });
		expect((await call("/templates/gone?version=1", { method: "DELETE" })).status).toBe(204);
		expect((await (await call("/templates/gone")).json()).versions).toHaveLength(1);
		expect((await call("/templates/gone", { method: "DELETE" })).status).toBe(204);
		expect((await call("/templates/gone")).status).toBe(404);
		expect((await call("/templates/gone", { method: "DELETE" })).status).toBe(404);
	});

	it("refuses bad names, files and versions", async () => {
		const bad = async (res: Promise<Response>, status: number, message: RegExp) => {
			const r = await res;
			expect(r.status).toBe(status);
			expect((await r.json()).error).toMatch(message);
		};
		await bad(upload({ file: new Blob([template]) }), 400, /name/);
		await bad(upload({ name: "Acme!", file: new Blob([template]) }), 400, /lowercase/);
		await bad(upload({ name: "dark", file: new Blob([template]) }), 400, /built-in/);
		await bad(upload({ name: "layouts", file: new Blob([template]) }), 400, /reserved/);
		await bad(upload({ name: "x", file: new Blob(["hello"]) }), 400, /not a/);
		await bad(upload({ name: "x", file: new Blob([template]) }, "x.key"), 400, /\.pptx/);
		await bad(call("/templates/acme?version=0"), 400, /version/);
		await bad(call("/templates/nope"), 404, /no template/);
		await bad(call("/templates/..%2F..%2Fetc"), 404, /no template/);
		const render = (body: unknown) =>
			call("/render", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
		await bad(render({ markdown: "# a", template: "nope" }), 404, /no template "nope"/);
		await bad(render({ markdown: "# a", template: "acme", templateVersion: 9 }), 404, /version 9/);
		await bad(render({ markdown: "# a", template: "acme", templateVersion: "x" }), 400, /version/);
		expect((await call("/templates/acme", { method: "PUT" })).status).toBe(405);
	});

	it("need the API key like every other route", async () => {
		const locked = createHandler({
			...options,
			templates: createTemplateStore(dir),
			apiKey: "k".repeat(32),
		});
		expect((await locked(new Request("http://test/templates"))).status).toBe(401);
		expect((await locked(new Request("http://test/templates/acme/file"))).status).toBe(401);
	});
});
