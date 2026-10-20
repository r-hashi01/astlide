import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	distFile,
	FontRegistry,
	familiesIn,
	layoutPage,
	toScene,
	transformText,
} from "@astlide/engine";
import { describe, expect, it } from "vitest";

/** A font every install has (KaTeX ships TrueType), for text tests. */
const FONT = join(
	createRequire(import.meta.url).resolve("katex/package.json"),
	"..",
	"dist",
	"fonts",
	"KaTeX_Main-Regular.ttf",
);

function page(css: string, body: string) {
	const dir = mkdtempSync(join(tmpdir(), "astlide-engine-"));
	const file = join(dir, "index.html");
	writeFileSync(
		file,
		`<html><head><style>body{font-family:T;font-size:20px}.slide{width:1000px;height:500px;display:flex;flex-direction:column}${css}</style></head><body><section class="slide">${body}</section></body></html>`,
	);
	const fonts = new FontRegistry();
	fonts.add("T", 400, false, FONT);
	const [slide] = layoutPage(file, dir, fonts, { width: 1000, height: 500, media: "screen" });
	if (!slide) throw new Error("no slide");
	return slide;
}

/** Lay out one slide of boxes (no text, so no fonts needed); returns boxes by class. */
function boxes(css: string, body: string) {
	const dir = mkdtempSync(join(tmpdir(), "astlide-engine-"));
	const file = join(dir, "index.html");
	writeFileSync(
		file,
		`<html><head><style>.slide{width:1000px;height:500px;display:flex;flex-direction:column}${css}</style></head><body><section class="slide">${body}</section></body></html>`,
	);
	const [slide] = layoutPage(file, dir, new FontRegistry(), {
		width: 1000,
		height: 500,
		media: "screen",
	});
	const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
	for (const b of slide?.boxes ?? []) {
		const cls = slide?.elements[b.eid]?.attribs.class;
		if (cls)
			out[cls] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
	}
	return out;
}

describe("engine layout", () => {
	it("doesn't wrap a nowrap column: an aspect-ratio box overflows below its sibling", () => {
		const b = boxes(
			".c{flex:1;display:flex;flex-direction:column;flex-wrap:nowrap;gap:10px;min-height:0}.a{height:100px}.v{width:100%;aspect-ratio:16/9}",
			'<div class="c"><div class="a"></div><div class="v"></div></div>',
		);
		expect(b.a).toEqual({ x: 0, y: 0, w: 1000, h: 100 });
		expect(b.v).toEqual({ x: 0, y: 110, w: 1000, h: 563 });
	});

	it("never shrinks children in block flow", () => {
		const b = boxes(
			".blk{display:block;height:300px}.x{height:200px}.y{height:200px}",
			'<div class="blk"><div class="x"></div><div class="y"></div></div>',
		);
		expect(b.x?.h).toBe(200);
		expect(b.y).toMatchObject({ y: 200, h: 200 });
	});

	it("resolves min() with what it knows", () => {
		const b = boxes(".m{width:min(480px, 100%);height:10px}", '<div class="m"></div>');
		expect(b.m?.w).toBe(480);
	});

	it("breaks pre-wrap text after hyphens, and long words with overflow-wrap", () => {
		const hyphen = page(
			".p{width:120px;white-space:pre-wrap}",
			'<div class="p">aaaa-bbbbbbbb</div>',
		);
		expect(hyphen.lines.map((l) => l.text)).toEqual(["aaaa-", "bbbbbbbb"]);
		const long = page(
			".p{width:100px;overflow-wrap:break-word}",
			'<div class="p">abcdefghijklmnopqrstuvwxyz</div>',
		);
		expect(long.lines.length).toBeGreaterThan(1);
		expect(long.lines.map((l) => l.text).join("")).toBe("abcdefghijklmnopqrstuvwxyz");
		for (const l of long.lines) expect(l.w).toBeLessThanOrEqual(100.5);
	});

	it("applies text-transform to the text it lays out", () => {
		const s = page(".u{text-transform:uppercase}", '<div class="u">Quarterly review</div>');
		expect(s.lines.map((l) => l.text)).toEqual(["QUARTERLY REVIEW"]);
		expect(transformText("next steps for q3", "capitalize")).toBe("Next Steps For Q3");
		expect(transformText("ABC", "lowercase")).toBe("abc");
	});

	it("names the font asked for when it has none of them, measuring with a stand-in", () => {
		const s = page(
			'.a{font-family:"Calibri Light",system-ui,sans-serif}.b{font-family:"Nope",T}',
			'<div class="a">Title</div><div class="b">Body</div>',
		);
		const text = toScene(s).items.filter((i) => i.kind === "text");
		// No Calibri Light: measured with T (the only font), named as asked, nothing to embed.
		expect(text[0]).toMatchObject({ text: "Title", font: { family: "Calibri Light" } });
		expect(text[0]?.kind === "text" && text[0].font.file).toBeUndefined();
		// A later family it has wins, as in a browser.
		expect(text[1]?.kind === "text" && text[1].font.file).toBe(FONT);
	});

	it("resolves generic families to a common font of the kind, not the first one registered", () => {
		const fonts = new FontRegistry();
		fonts.add("KaTeX_AMS", 400, false, FONT);
		fonts.add("Inter", 400, false, FONT);
		fonts.add("JetBrains Mono", 400, false, FONT);
		expect(fonts.pick('"Missing", sans-serif', 400, false).family).toBe("inter");
		expect(fonts.pick("monospace", 400, false).family).toBe("jetbrains mono");
		expect(fonts.pick('"Missing"', 400, false).family).toBe("inter");
		expect(fonts.resolve('"Calibri", sans-serif', 400, false).requested).toBe("Calibri");
		expect(fonts.resolve('"Inter", sans-serif', 400, false).requested).toBeUndefined();
	});

	it("puts a list marker on the item's first line, also with a tight line-height", () => {
		const s = page(
			"ul{margin:0 0 0 40px;padding:0;line-height:0.8}li{width:150px}",
			"<ul><li>first line wraps onto a second one</li></ul>",
		);
		const [marker] = s.markers;
		const first = s.lines[0];
		expect(s.lines.length).toBeGreaterThan(1);
		expect(marker && first && Math.abs(marker.y - first.y)).toBeLessThan(2);
	});

	it("finds a built file from a URL with or without the site's base path", () => {
		const dist = mkdtempSync(join(tmpdir(), "astlide-dist-"));
		mkdirSync(join(dist, "_astro"));
		writeFileSync(join(dist, "_astro", "a.css"), "x");
		const file = join(dist, "_astro", "a.css");
		expect(distFile(dist, "/_astro/a.css")).toBe(file);
		expect(distFile(dist, "/my-repo/demo/_astro/a.css?v=1")).toBe(file);
		expect(distFile(dist, "/my-repo/missing.css")).toBeNull();
		expect(distFile(dist, "/../../etc/passwd")).toBeNull();
	});

	it("places absolute boxes against the nearest positioned ancestor, not their parent", () => {
		const b = boxes(
			".slide{position:relative;padding:64px;box-sizing:border-box}.c{flex:1}.abs{position:absolute;inset:0}.rel{position:relative;top:10px;left:20px;height:50px}",
			'<div class="c"><div class="abs"></div><div class="rel"></div></div>',
		);
		expect(b.abs).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
		expect(b.rel).toMatchObject({ x: 84, y: 74 });
	});

	it("resolves currentColor in borders and backgrounds, and draws buttons like Chromium", () => {
		const s = page(
			".a{color:#ff0000;border:3px solid;width:50px;height:20px}.b{color:#0000ff;background:currentColor;border:1px solid currentcolor;width:50px;height:20px}",
			'<div class="a"></div><div class="b"></div><div><button>Go</button></div>',
		);
		const rects = toScene(s).items.flatMap((i) =>
			i.kind === "rect" ? [{ fill: i.fill?.hex, border: i.border?.color.hex }] : [],
		);
		expect(rects).toEqual([
			{ fill: undefined, border: "ff0000" },
			{ fill: "0000ff", border: "0000ff" },
			{ fill: "efefef", border: "767676" },
		]);
	});

	it("reads font families from CSS quickly, even from pathological input", () => {
		expect(familiesIn('body{font-family: "Inter", "Noto Sans JP", sans-serif}')).toEqual([
			"Inter",
			"Noto Sans JP",
		]);
		const start = performance.now();
		familiesIn(`a{font-family:${" ".repeat(50000)}x`);
		familiesIn(`@font-face{src:${"url(".repeat(20000)}`);
		expect(performance.now() - start).toBeLessThan(500);
	});

	it("clips to ancestors with overflow other than visible", () => {
		const s = page(
			".o{width:200px;height:30px;overflow:hidden;line-height:30px}",
			'<div class="o">one<br>two</div>',
		);
		expect(s.lines.map((l) => l.clip)).toEqual([
			{ x: 0, y: 0, w: 200, h: 30 },
			{ x: 0, y: 0, w: 200, h: 30 },
		]);
	});

	it("lays out a srcdoc iframe into the slide, clipped to the frame", () => {
		const s = page(
			"iframe{border:0;width:300px;height:100px;margin-left:50px}",
			'<iframe srcdoc="&lt;body style=&quot;margin:10px&quot;&gt;inside&lt;/body&gt;"></iframe>',
		);
		const inside = s.lines.find((l) => l.text === "inside");
		expect(inside).toMatchObject({ x: 60, clip: { x: 50, y: 0, w: 300, h: 100 } });
	});
});
