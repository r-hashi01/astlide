import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	distFile,
	FontRegistry,
	familiesIn,
	isInside,
	layoutPage,
	toScene,
	transformText,
} from "@astlide/core/engine";
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

	it("lays out grid columns: auto beside fr, fixed widths, spans", () => {
		const icon = boxes(
			".g{display:grid;grid-template-columns:auto 1fr;column-gap:20px;width:600px}.ic{width:64px;height:64px}.t{height:30px}",
			'<div class="g"><div class="i"><div class="ic"></div></div><div class="t"></div></div>',
		);
		expect(icon.i).toMatchObject({ x: 0, y: 0, w: 64 });
		expect(icon.t).toMatchObject({ x: 84, y: 0, w: 516 });
		const footer = boxes(
			".g{display:grid;grid-template-columns:1fr auto 1fr;width:900px}.m{width:100px;height:10px}",
			'<div class="g"><div class="l"></div><div class="c"><div class="m"></div></div><div class="r"></div></div>',
		);
		expect([footer.l?.x, footer.c?.x, footer.r?.x]).toEqual([0, 400, 500]);
		expect(footer.c?.w).toBe(100);
		const fixed = boxes(
			".g{display:grid;grid-template-columns:100px 100px;width:900px}.g>div{height:20px}",
			'<div class="g"><div class="a"></div><div class="b"></div><div class="c"></div><div class="h"></div></div>',
		);
		expect(fixed.c).toMatchObject({ x: 0, y: 20, w: 100 });
		const span = boxes(
			".g{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:320px}.g>div{height:20px}.h{grid-column:1 / -1}",
			'<div class="g"><div class="h"></div><div class="a"></div><div class="b"></div></div>',
		);
		expect(span.h).toMatchObject({ x: 0, y: 0, w: 320 });
		expect(span.a).toMatchObject({ x: 0, y: 30, w: 100 });
		expect(span.b).toMatchObject({ x: 110, y: 30, w: 100 }); // Fractional sizes: the two columns still share a row.
		const frac = boxes(
			".g{display:grid;grid-template-columns:1fr 1fr;column-gap:0.8px;width:999.9px}.g>div{height:20px}",
			'<div class="g"><div class="a"></div><div class="b"></div></div>',
		);
		expect(frac.b).toMatchObject({ y: 0 });
	});

	// Each checked against Chromium.
	it("sizes grid rows by their tracks: fixed, auto, fr (css-grid-1 §11.7)", () => {
		const two = '<div class="g"><div class="a"></div><div class="b"></div></div>';
		const autoFr = boxes(
			".g{display:grid;height:400px;grid-template-rows:auto 1fr}.a{height:50px}",
			two,
		);
		expect(autoFr.b).toMatchObject({ y: 50, h: 350 });
		const fixedFr = boxes(".g{display:grid;height:400px;grid-template-rows:100px 1fr}", two);
		expect(fixedFr.a).toMatchObject({ h: 100 });
		expect(fixedFr.b).toMatchObject({ y: 100, h: 300 });
		const ratio = boxes(".g{display:grid;height:400px;grid-template-rows:1fr 3fr}", two);
		expect(ratio.a?.h).toBe(100);
		expect(ratio.b?.h).toBe(300);
		// No definite height: fr rows as tall as the largest content per fr.
		const content = boxes(".g{display:grid;grid-template-rows:1fr 2fr}.a,.b{height:30px}", two);
		expect(content.g?.h).toBe(90);
	});

	it("places grid items by line numbers, grid-area and rows", () => {
		const two = '<div class="g"><div class="a"></div><div class="b"></div></div>';
		const g = ".g{display:grid;grid-template-columns:repeat(3,100px)}.a,.b{height:10px}";
		expect(boxes(`${g}.a{grid-column:1 / 3}`, two).a).toMatchObject({ x: 0, w: 200 });
		expect(boxes(`${g}.a{grid-column:2 / -1}`, two).a).toMatchObject({ x: 100, w: 200 });
		expect(boxes(`${g}.a{grid-column-start:2}`, two).a).toMatchObject({ x: 100, w: 100 });
		expect(boxes(`${g}.a{grid-area:2 / 2 / 3 / 4}`, two).a).toMatchObject({
			x: 100,
			y: 10,
			w: 200,
		});
		// An item with a row goes first; the others flow around it.
		const placed = boxes(
			".g{display:grid;grid-template-columns:repeat(2,100px)}.a,.b{height:10px}.b{grid-row:1;grid-column:1}",
			two,
		);
		expect(placed.b).toMatchObject({ x: 0, y: 0 });
		expect(placed.a).toMatchObject({ x: 100, y: 0 });
	});

	it("keeps a minmax() minimum when sharing grid space among fr tracks", () => {
		const b = boxes(
			".g{display:grid;width:1000px;grid-template-columns:minmax(600px,1fr) 1fr}.a,.b{height:10px}",
			'<div class="g"><div class="a"></div><div class="b"></div></div>',
		);
		expect(b.a?.w).toBe(600);
		expect(b.b).toMatchObject({ x: 600, w: 400 });
	});

	it("centers a grid item with place-self, place-content or auto margins", () => {
		const one = '<div class="g"><div class="a"></div></div>';
		const g = ".g{display:grid;width:400px;height:400px}.a{width:100px;height:100px}";
		expect(boxes(`${g}.a{place-self:center}`, one).a).toMatchObject({ x: 150, y: 150 });
		expect(boxes(`${g}.a{margin:auto}`, one).a).toMatchObject({ x: 150, y: 150 });
		expect(boxes(`${g}.a{margin-left:auto}`, one).a).toMatchObject({ x: 300, y: 0 });
		const content = boxes(
			".g{display:grid;width:400px;height:400px;grid-template-columns:100px;grid-template-rows:100px;place-content:center}.a{height:100px}",
			one,
		);
		expect(content.a).toMatchObject({ x: 150, y: 150 });
	});

	it("expands shorthands with var() after substituting it", () => {
		const b = boxes(
			":root{--p:20px 40px;--m:5px}.s{display:flex;flex-direction:column;width:500px;height:100px;padding:var(--p, 4px);margin:var(--m) 0 0}.in{height:10px}",
			'<div class="s"><div class="in"></div></div>',
		);
		expect(b.s).toMatchObject({ x: 0, y: 5, w: 580 });
		expect(b.in).toMatchObject({ x: 40, y: 25, w: 500 });
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

	it("breaks Japanese text between characters, with kinsoku", () => {
		const text = "日本語の文章は空白なしで続きます。「括弧」の前後でも、句読点は行頭に来ません。";
		// The test font has no CJK glyphs: each character measures ~5px.
		const p = page(".p{width:60px}", `<div class="p">${text}</div>`);
		const lines = p.lines.map((l) => l.text);
		expect(lines.length).toBeGreaterThan(2);
		expect(lines.join("")).toBe(text);
		for (const l of p.lines) expect(l.w).toBeLessThanOrEqual(60.5);
		for (const l of lines) {
			expect(l).not.toMatch(/^[、。」]/);
			expect(l).not.toMatch(/「$/);
		}
	});

	it("keeps text on one line in a box a rounding step narrower than it", () => {
		const text = "Dify 製品価値と導入";
		const [wide] = page(".p{width:900px}", `<div class="p">${text}</div>`).lines;
		// A width on Yoga's 1/64px grid, 0.01–1/32px narrower than the text.
		const text64 = (wide?.w ?? 0) * 64;
		let w = Math.floor(text64) / 64;
		if (text64 / 64 - w <= 0.01) w -= 1 / 64;
		const tight = page(`.p{width:${w}px}`, `<div class="p">${text}</div>`);
		expect(tight.lines.map((l) => l.text)).toEqual([text]);
	});

	it("keeps Latin words whole next to CJK, and doesn't break nowrap text", () => {
		const mixed = page(".p{width:60px}", '<div class="p">漢字漢字漢字abcdefgh漢字漢字</div>');
		expect(mixed.lines.map((l) => l.text).some((l) => l.includes("abcdefgh"))).toBe(true);
		const nowrap = page(".p{width:20px;white-space:nowrap}", '<div class="p">日本語の文章</div>');
		expect(nowrap.lines.map((l) => l.text)).toEqual(["日本語の文章"]);
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

	it("measures a proprietary family with its metric-compatible clone, still naming the family", () => {
		const fonts = new FontRegistry();
		fonts.add("Inter", 400, false, FONT);
		fonts.add("Arimo", 400, false, FONT);
		fonts.add("Carlito", 400, false, FONT);
		const helvetica = fonts.resolve("Helvetica, sans-serif", 400, false);
		expect(helvetica.face.family).toBe("arimo");
		expect(helvetica.requested).toBe("Helvetica");
		expect(fonts.resolve('"Calibri"', 400, false)).toMatchObject({
			face: { family: "carlito" },
			requested: "Calibri",
		});
		// Without the clone: a stand-in, as before.
		expect(fonts.resolve('"Times New Roman", serif', 400, false).face.family).toBe("inter");
		// A clone the page names itself is just a family.
		expect(fonts.resolve("Arimo", 400, false).requested).toBeUndefined();
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

	it("doesn't take a sibling folder sharing the dist folder's name for it", () => {
		const parent = mkdtempSync(join(tmpdir(), "astlide-dist-"));
		const dist = join(parent, "dist");
		mkdirSync(dist);
		mkdirSync(join(parent, "dist-old"));
		writeFileSync(join(parent, "dist-old", "secret.css"), "x");
		expect(distFile(dist, "/x/../../dist-old/secret.css")).toBeNull();
		expect(distFile(dist, "/%2e%2e/dist-old/secret.css")).toBeNull();
		expect(isInside(dist, join(parent, "dist-old", "secret.css"))).toBe(false);
		expect(isInside(dist, join(dist, "a", "b.css"))).toBe(true);
		expect(isInside(dist, dist)).toBe(true);
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

	it("paints no box gradient behind gradient text (-webkit-background-clip: text)", () => {
		const s = page(
			".g{background-image:linear-gradient(red,blue);width:50px;height:20px}.t{-webkit-background-clip:text;color:transparent}",
			'<div class="g">box</div><div class="g t">text</div>',
		);
		const fills = toScene(s).items.filter((i) => i.kind !== "text");
		expect(fills).toHaveLength(1);
	});

	it("reads font families from CSS quickly, even from pathological input", () => {
		expect(familiesIn('body{font-family: "Inter", "Noto Sans JP", sans-serif}')).toEqual([
			"Inter",
			"Noto Sans JP",
		]);
		const start = performance.now();
		familiesIn(`a{font-family:${" ".repeat(50000)}x`);
		familiesIn(`@font-face{src:${"url(".repeat(20000)}`);
		familiesIn("@font-face{{".repeat(20000));
		expect(familiesIn("@font-face{font-family:Skip}p{font-family:Keep}")).toEqual(["Keep"]);
		// CSS-wide keywords are values, not families; a quoted one is a family name.
		expect(
			familiesIn(
				'a{font-family:inherit}b{font-family:INITIAL !important}c{font-family:unset}d{font-family:"inherit"}',
			),
		).toEqual(["inherit"]);
		expect(familiesIn("p{font-family:Inter, ui-rounded, fangsong}")).toEqual(["Inter"]);
		// First choices come before fallbacks named earlier in the CSS.
		expect(
			familiesIn(
				':root{--font-mono:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas}body{font-family:system-ui, "Segoe UI", Roboto, Arial}.deck{font-family:"Geist", "Noto Sans JP", sans-serif}',
			),
		).toEqual([
			"Geist",
			"SFMono-Regular",
			"Segoe UI",
			"Noto Sans JP",
			"Menlo",
			"Roboto",
			"Monaco",
			"Arial",
			"Consolas",
		]);
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

	it("lays out same-site iframes only from pages inside the built site", () => {
		const parent = mkdtempSync(join(tmpdir(), "astlide-frames-"));
		const dist = join(parent, "dist");
		mkdirSync(join(dist, "deck", "1"), { recursive: true });
		mkdirSync(join(dist, "card"));
		writeFileSync(join(dist, "card", "index.html"), "<body>card</body>");
		// Next to dist/, not in it: `${dist}.html`.
		writeFileSync(join(parent, "dist.html"), "<body>outside</body>");
		const file = join(dist, "deck", "1", "index.html");
		writeFileSync(
			file,
			`<html><head><style>body{font-family:T;font-size:20px}.slide{width:1000px;height:500px;display:flex;flex-direction:column}iframe{border:0;width:300px;height:100px}</style></head><body><section class="slide"><iframe src="../../card/"></iframe><iframe src="../.."></iframe></section></body></html>`,
		);
		const fonts = new FontRegistry();
		fonts.add("T", 400, false, FONT);
		const [slide] = layoutPage(file, dist, fonts, { width: 1000, height: 500, media: "screen" });
		const texts = slide?.lines.map((l) => l.text) ?? [];
		expect(texts).toContain("card");
		expect(texts).not.toContain("outside");
	});

	it("lays out a bounded number of frames, never a page inside itself", () => {
		const dist = mkdtempSync(join(tmpdir(), "astlide-fanout-"));
		const css =
			"<style>body{font-family:T;font-size:20px}.slide{width:1000px;height:500px}iframe{border:0;width:50px;height:20px}</style>";
		const frames = (src: string) => `<iframe src="${src}"></iframe>`.repeat(10);
		// 10 frames of a page with 10 frames of a page with 10 frames: 1110 documents unbounded.
		for (const [name, inner] of [
			["a", frames("/b/")],
			["b", frames("/c/")],
			["c", "leaf"],
		] as const) {
			mkdirSync(join(dist, name));
			writeFileSync(
				join(dist, name, "index.html"),
				`<html><head>${css}</head><body>${inner}</body></html>`,
			);
		}
		mkdirSync(join(dist, "deck"));
		const file = join(dist, "deck", "index.html");
		writeFileSync(
			file,
			`<html><head>${css}</head><body><section class="slide">${frames("/a/")}<iframe src="/deck/"></iframe>self</section></body></html>`,
		);
		const fonts = new FontRegistry();
		fonts.add("T", 400, false, FONT);
		const started = performance.now();
		const [slide] = layoutPage(file, dist, fonts, { width: 1000, height: 500, media: "screen" });
		const texts = slide?.lines.map((l) => l.text) ?? [];
		expect(texts.filter((t) => t === "leaf").length).toBeLessThanOrEqual(32);
		// The page doesn't lay itself out again inside its own frame.
		expect(texts.filter((t) => t === "self")).toHaveLength(1);
		expect(performance.now() - started).toBeLessThan(5000);
	});

	it("doesn't follow symlinks in dist/ to files elsewhere", () => {
		const parent = mkdtempSync(join(tmpdir(), "astlide-links-"));
		const dist = join(parent, "dist");
		const outside = join(parent, "outside");
		mkdirSync(join(dist, "deck", "1"), { recursive: true });
		mkdirSync(outside);
		writeFileSync(join(outside, "index.html"), "<body>secret</body>");
		writeFileSync(join(outside, "secret.css"), ".slide{background:red}");
		// A committed dist/ (someone else's project) with links pointing out of it.
		symlinkSync(outside, join(dist, "leak"));
		symlinkSync(join(outside, "secret.css"), join(dist, "s.css"));
		expect(distFile(dist, "/s.css")).toBeNull();
		expect(distFile(dist, "/leak/secret.css")).toBeNull();
		expect(isInside(dist, join(dist, "s.css"))).toBe(false);
		const file = join(dist, "deck", "1", "index.html");
		writeFileSync(
			file,
			`<html><head><link rel="stylesheet" href="/s.css"><style>body{font-family:T;font-size:20px}.slide{width:1000px;height:500px;display:flex;flex-direction:column}iframe{border:0;width:300px;height:100px}</style></head><body><section class="slide"><iframe src="/leak/"></iframe><iframe src="../../leak/"></iframe></section></body></html>`,
		);
		const fonts = new FontRegistry();
		fonts.add("T", 400, false, FONT);
		const [slide] = layoutPage(file, dist, fonts, { width: 1000, height: 500, media: "screen" });
		expect(slide?.lines.map((l) => l.text) ?? []).not.toContain("secret");
	});

	it("resolves corner radii in rem and vw against the page, in any colour syntax (#317)", () => {
		const s = page(
			"html{font-size:20px}.a{width:50px;height:20px;border-radius:1rem;background:oklch(0.623 0.214 259.815)}.b{width:50px;height:20px;border-radius:1vw 0 0 0;background:hsl(120 100% 25%)}",
			'<div class="a"></div><div class="b"></div>',
		);
		const rects = toScene(s).items.flatMap((i) =>
			i.kind === "rect" ? [{ radius: i.radius, fill: i.fill?.hex }] : [],
		);
		expect(rects).toEqual([
			{ radius: 20, fill: "2b7fff" },
			{ radius: 10, fill: "008000" },
		]);
	});

	it("shows an iframe's document inside its padding, in any unit (#317)", () => {
		const s = page(
			"html{font-size:20px}iframe{border:0;width:300px;height:100px;padding:1rem}",
			'<iframe srcdoc="&lt;body style=&quot;margin:0&quot;&gt;inside&lt;/body&gt;"></iframe>',
		);
		const inside = s.lines.find((l) => l.text === "inside");
		expect(inside).toMatchObject({ x: 20, y: 20 });
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
