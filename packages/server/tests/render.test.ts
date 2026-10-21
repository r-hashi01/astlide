/**
 * End to end: start the server on a free port and render real decks (an
 * Astro build + export per request). Slow — seconds per render.
 */

import { existsSync, readdirSync } from "node:fs";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHandler } from "../src/app";
import { resolveOptions, type ServerOptions } from "../src/config";
import { type RunningServer, serve } from "../src/http";
import { templateFixture } from "./fixtures";

let options: ServerOptions;
let server: RunningServer;

beforeAll(async () => {
	options = resolveOptions({});
	server = await serve(createHandler(options), { port: 0, hostname: "127.0.0.1" });
});
afterAll(async () => {
	await server?.close();
});

/** Chromium for PDF / PNG (CI's unit-test job doesn't install it). */
async function hasChromium(): Promise<boolean> {
	try {
		const { chromium } = await import("playwright");
		return existsSync(chromium.executablePath());
	} catch {
		return false;
	}
}

const projects = () => readdirSync(options.workDir).filter((n) => n.startsWith("render-"));

async function slideTexts(pptx: ArrayBuffer | Uint8Array): Promise<string[]> {
	const archive = await JSZip.loadAsync(pptx);
	const slides = Object.keys(archive.files)
		.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
		.sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
	return Promise.all(
		slides.map(async (n) =>
			[...((await archive.file(n)?.async("string")) ?? "").matchAll(/<a:t>([^<]*)<\/a:t>/g)]
				.map((m) => m[1])
				.join(" "),
		),
	);
}

describe("POST /render (end to end)", () => {
	it("renders Markdown to an editable PPTX and deletes the project", async () => {
		const res = await fetch(`${server.url}/render`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				markdown:
					"---\nslideLayout: cover\n---\n# Quarterly review\n\nQ3 2026\n---\n# 日本語のスライド\n\n- First point\n- Second point",
				theme: "corporate",
				title: "Quarterly review",
			}),
		});
		const body = await res.arrayBuffer();
		expect(res.status, Buffer.from(body).toString()).toBe(200);
		expect(res.headers.get("content-type")).toContain("presentationml");
		expect(res.headers.get("content-disposition")).toContain("Quarterly-review.pptx");
		expect(Number(res.headers.get("x-render-time-ms"))).toBeGreaterThan(0);
		const texts = await slideTexts(body);
		expect(texts).toHaveLength(2);
		expect(texts[0]).toContain("Quarterly review");
		expect(texts[1]).toContain("日本語のスライド");
		expect(texts[1]).toContain("Second point");
		expect(projects()).toEqual([]);
	}, 180_000);

	it("renders with an uploaded template and returns base64 JSON", async () => {
		const data = new FormData();
		data.append(
			"slides",
			JSON.stringify([
				{ markdown: "# Brand cover", slideLayout: "cover" },
				{ markdown: "# Agenda\n\n- One", slideLayout: "title-and-content" },
			]),
		);
		data.append("output", "base64");
		data.append("template", new Blob([await templateFixture()]), "brand.pptx");
		const res = await fetch(`${server.url}/render`, { method: "POST", body: data });
		const body = await res.json();
		expect(res.status, JSON.stringify(body)).toBe(200);
		expect(body).toMatchObject({ filename: "slides.pptx", contentType: expect.any(String) });
		const texts = await slideTexts(Buffer.from(body.data, "base64"));
		expect(texts.join(" ")).toContain("Agenda");
	}, 180_000);

	it("renders a PDF when Chromium is installed", async (ctx) => {
		if (!(await hasChromium())) ctx.skip();
		const res = await fetch(`${server.url}/render`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ slides: ["# One", "# Two"], format: "pdf" }),
		});
		const body = Buffer.from(await res.arrayBuffer());
		expect(res.status, body.toString()).toBe(200);
		expect(body.subarray(0, 5).toString()).toBe("%PDF-");
	}, 180_000);

	it("refuses a rendered file over MAX_OUTPUT_MB", async () => {
		const small = createHandler({ ...options, maxOutputBytes: 1000 });
		const res = await small(
			new Request("http://test/render", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ markdown: "# A" }),
			}),
		);
		expect(res.status).toBe(422);
		expect((await res.json()).error).toMatch(/over/);
		expect(projects()).toEqual([]);
	}, 180_000);
});
