/**
 * The layout engine (`check_deck`, PowerPoint export) against Chromium: each
 * fixture is laid out by both, and the boxes marked `data-c` must land within
 * a couple of pixels of each other. Both use the same TrueType font (KaTeX's),
 * so text measures the same.
 */

import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { FontRegistry, layoutPage, loadFontFaces, pageCss } from "@astlide/core/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { useBrowser } from "./helpers/browser";

const browser = useBrowser();
const FONT = join(
	createRequire(import.meta.url).resolve("katex/package.json"),
	"..",
	"dist",
	"fonts",
	"KaTeX_Main-Regular.ttf",
);
const W = 1000;
const H = 600;
/** How far a box may be from Chromium's, in px. */
const TOLERANCE = 2;

/** Astlide's own pages reset margins and use border-box sizing. */
const BASE = `@font-face{font-family:T;src:url(/t.ttf) format("truetype")}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:T;font-size:20px;line-height:1.4}
.slide{width:${W}px;height:${H}px;display:flex;flex-direction:column;overflow:hidden}`;

const dir = mkdtempSync(join(tmpdir(), "astlide-parity-"));
copyFileSync(FONT, join(dir, "t.ttf"));
let server: Server;
let base: string;
beforeAll(async () => {
	server = createServer((req, res) => {
		// The fixtures and the font, by file name: nothing outside the folder.
		const file = join(dir, basename((req.url ?? "/").split("?")[0] ?? "/"));
		try {
			const body = readFileSync(file);
			res.writeHead(200, { "content-type": file.endsWith(".ttf") ? "font/ttf" : "text/html" });
			res.end(body);
		} catch {
			res.writeHead(404);
			res.end();
		}
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

type Rect = [x: number, y: number, w: number, h: number];

/** Lay out a fixture in Chromium and in the engine; the boxes of `data-c` elements by name. */
async function both(name: string, css: string, body: string) {
	const html = `<!doctype html><html><head><style>${BASE}${css}</style></head><body><section class="slide">${body}</section></body></html>`;
	writeFileSync(join(dir, `${name}.html`), html);

	const page = await browser().newPage({ viewport: { width: W, height: H } });
	await page.goto(`${base}/${name}.html`);
	await page.evaluate(() => document.fonts.ready);
	const chromium = await page.evaluate(() => {
		const slide = document.querySelector(".slide")?.getBoundingClientRect();
		const out: Record<string, number[]> = {};
		for (const el of document.querySelectorAll("[data-c]")) {
			const r = el.getBoundingClientRect();
			out[el.getAttribute("data-c") ?? ""] = [
				r.x - (slide?.x ?? 0),
				r.y - (slide?.y ?? 0),
				r.width,
				r.height,
			];
		}
		return out;
	});
	await page.close();

	const file = join(dir, `${name}.html`);
	const fonts = new FontRegistry();
	loadFontFaces(fonts, pageCss(file, dir), dir);
	const [layout] = layoutPage(file, dir, fonts, { width: W, height: H, media: "screen" });
	const engine: Record<string, number[]> = {};
	for (const b of layout?.boxes ?? []) {
		const c = layout?.elements[b.eid]?.attribs["data-c"];
		if (c) engine[c] = [b.x, b.y, b.w, b.h];
	}
	return { chromium: chromium as Record<string, Rect>, engine: engine as Record<string, Rect> };
}

/** The boxes that differ from Chromium's by more than the tolerance (empty when they match). */
async function differences(name: string, css: string, body: string): Promise<string[]> {
	const { chromium, engine } = await both(name, css, body);
	const out: string[] = [];
	for (const [key, c] of Object.entries(chromium)) {
		const e = engine[key];
		const round = (r: number[]) => r.map((n) => Math.round(n)).join(",");
		if (!e) out.push(`${key}: missing (Chromium ${round(c)})`);
		else if (c.some((v, i) => Math.abs(v - (e[i] ?? 0)) > TOLERANCE))
			out.push(`${key}: engine ${round(e)}, Chromium ${round(c)}`);
	}
	return out;
}

describe("layout engine vs Chromium", () => {
	it("grid columns: auto beside fr, 1fr auto 1fr, fractional gaps", async () => {
		expect(
			await differences(
				"grid",
				`.a{display:grid;grid-template-columns:auto 1fr;gap:20px}.icon{width:64px;height:64px}
.f{display:grid;grid-template-columns:1fr auto 1fr;margin-top:10px}.mid{width:100px;height:10px}
.h{display:grid;grid-template-columns:1fr 1fr;gap:12.6px;margin-top:10px}.h>div{height:30px}`,
				`<div class="a" data-c="a"><div data-c="a-icon"><div class="icon"></div></div><div data-c="a-text">Text beside an icon</div></div>
<div class="f" data-c="f"><div data-c="f-l"></div><div data-c="f-m"><div class="mid"></div></div><div data-c="f-r"></div></div>
<div class="h"><div data-c="h1"></div><div data-c="h2"></div><div data-c="h3"></div></div>`,
			),
		).toEqual([]);
	});

	it("shorthands with var()", async () => {
		expect(
			await differences(
				"var-shorthand",
				":root{--p:20px 40px}.s{padding:var(--p, 4px);height:200px}",
				'<div class="s" data-c="s"><div data-c="in" style="height:10px"></div></div>',
			),
		).toEqual([]);
	});

	it("a percentage width inside a box sized to its content", async () => {
		expect(
			await differences(
				"cyclic-width",
				`.row{display:flex;justify-content:center}
.badge{display:flex;align-items:center;gap:10px;padding:10px 20px;background:#36f}
.icon{display:inline-flex;width:60%}.icon svg{width:100%;height:24px}
.col{display:flex;flex-direction:column;align-items:center;margin-top:20px}
.title{width:100%}.title h1{font-size:40px;padding-right:80px}`,
				`<div class="row"><div class="badge" data-c="badge"><span class="icon" data-c="icon"><svg width="24" height="24" viewBox="0 0 24 24"></svg></span>LLM Generate</div></div>
<div class="col" data-c="col"><div class="title" data-c="title"><h1 data-c="h1">A title in a column</h1></div></div>`,
			),
		).toEqual([]);
	});

	// Known difference (#351): here Chromium sizes the badge with the icon as
	// wide as its final height (41px) and the engine with the picture's own
	// width (24px); on the 101a-ja deck's badge both give Chromium's size.
	it.fails("a percentage height with aspect-ratio inside a box sized to its content", async () => {
		expect(
			await differences(
				"cyclic-height",
				`.row{display:flex;justify-content:center}
.badge{display:flex;align-items:center;gap:10.5px;padding:10.5px 21px;font-size:21px;font-weight:700}
.icon{display:inline-flex;width:60%;height:60%;aspect-ratio:1/1}.icon svg{width:100%;height:100%}`,
				`<div class="row"><div class="badge" data-c="badge"><span class="icon" data-c="icon"><svg width="24" height="24" viewBox="0 0 24 24"></svg></span>LLM Generate</div></div>`,
			),
		).toEqual([]);
	});

	it("a grid item that's inline-block, holding a table at width 100%", async () => {
		expect(
			await differences(
				"grid-inline-block",
				`.g{display:grid;grid-template-columns:1.4fr 1fr;gap:10px}
.r{display:inline-block}.r table{width:100%;border-collapse:collapse}.r td{border:1px solid #ccc;padding:4px}`,
				`<div class="g"><div class="r" data-c="r"><table data-c="table"><tr><td>One</td><td>Two</td></tr><tr><td>Three</td><td>Four</td></tr></table></div><aside data-c="aside">Side</aside></div>`,
			),
		).toEqual([]);
	});

	it("transforms: scale about the center, translate, a custom origin", async () => {
		expect(
			await differences(
				"transform",
				`:root{--s:.9}.a{width:400px;height:100px;transform:translateX(0) scaleX(var(--s)) scaleY(var(--s))}
.b{width:200px;height:50px;margin-top:20px;transform:translate(10px, 25%)}
.c{width:300px;height:60px;margin-top:20px;transform:scale(0.5);transform-origin:left top}`,
				'<div class="a" data-c="a"><p data-c="a-p">Scaled text inside</p></div><div class="b" data-c="b"></div><div class="c" data-c="c"><div data-c="c-in" style="height:20px"></div></div>',
			),
		).toEqual([]);
	});

	it("a percentage height in a stretched row item", async () => {
		expect(
			await differences(
				"stretched-height",
				".row{display:flex;height:200px}.item{flex:1}.full{height:100%;background:#eee}",
				'<div class="row"><div class="item" data-c="item"><div class="full" data-c="full"></div></div><div class="item"></div></div>',
			),
		).toEqual([]);
	});
});
