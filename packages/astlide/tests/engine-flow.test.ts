import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FontRegistry, layoutPage } from "../src/engine";
import { type FlexItem, resolveFlexibleLengths } from "../src/engine/flow/flex";
import { layoutLines } from "../src/engine/lines";

/** A font every install has (KaTeX ships TrueType), for text. */
const FONT = join(
	createRequire(import.meta.url).resolve("katex/package.json"),
	"..",
	"dist",
	"fonts",
	"KaTeX_Main-Regular.ttf",
);

/** Lay out one slide; boxes by class, and the files written next to it. */
function boxes(css: string, body: string, files: Record<string, string> = {}) {
	const dir = mkdtempSync(join(tmpdir(), "astlide-flow-"));
	for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
	const file = join(dir, "index.html");
	writeFileSync(
		file,
		`<html><head><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:T;font-size:20px}.slide{width:1000px;height:500px;display:flex;flex-direction:column}${css}</style></head><body><section class="slide">${body}</section></body></html>`,
	);
	const fonts = new FontRegistry();
	fonts.add("T", 400, false, FONT);
	const [slide] = layoutPage(file, dir, fonts, { width: 1000, height: 500, media: "screen" });
	const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
	for (const b of slide?.boxes ?? []) {
		const cls = slide?.elements[b.eid]?.attribs.class;
		if (cls)
			out[cls] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
	}
	return out;
}

const item = (over: Partial<FlexItem>): FlexItem => ({
	box: {
		type: "text",
		items: [],
		strut: undefined as never,
		align: "left",
		inFlow: false,
		indent: 0,
	},
	grow: 0,
	shrink: 1,
	base: 0,
	hypo: 0,
	min: 0,
	max: Number.POSITIVE_INFINITY,
	target: 0,
	frozen: false,
	mainStart: 0,
	mainEnd: 0,
	mainMargins: 0,
	crossStart: 0,
	crossMargins: 0,
	crossMin: 0,
	crossMax: Number.POSITIVE_INFINITY,
	autoMainStart: false,
	autoMainEnd: false,
	autoCrossStart: false,
	autoCrossEnd: false,
	align: "stretch",
	stretch: true,
	definiteCross: false,
	...over,
});

describe("flexible lengths (css-flexbox-1 §9.7)", () => {
	it("distributes free space from the flex base sizes, not from the minimums", () => {
		// flex: 1 1 0 with different min-content minimums: equal widths (Chromium), not 914 / 846.
		const line = [
			item({ grow: 1, base: 0, min: 185, hypo: 185 }),
			item({ grow: 1, base: 0, min: 117, hypo: 117 }),
		];
		resolveFlexibleLengths(line, 1792, 32);
		expect(line.map((it) => it.target)).toEqual([880, 880]);
	});

	it("freezes an item at its minimum and gives the rest to the others", () => {
		const line = [
			item({ grow: 1, base: 0, min: 700, hypo: 700 }),
			item({ grow: 1, base: 0, hypo: 0 }),
		];
		resolveFlexibleLengths(line, 1000, 0);
		expect(line.map((it) => it.target)).toEqual([700, 300]);
	});

	it("shrinks in proportion to flex-shrink × base size", () => {
		const line = [item({ base: 600, hypo: 600 }), item({ base: 200, hypo: 200 })];
		resolveFlexibleLengths(line, 600, 0);
		expect(line.map((it) => it.target)).toEqual([450, 150]);
	});
});

describe("layout core", () => {
	it("collapses adjacent and parent / first-child margins", () => {
		const b = boxes(
			".a{height:10px;margin-bottom:30px}.b{height:10px;margin-top:20px}.p{margin-top:15px}.c{height:10px;margin-top:25px}",
			'<div><div class="a"></div><div class="b"></div><div class="p"><div class="c"></div></div></div>',
		);
		expect(b.b?.y).toBe(40);
		// .p's 15px and .c's 25px collapse to 25 below .b's 0 bottom margin.
		expect(b.c?.y).toBe(75);
		expect(b.p?.y).toBe(75);
	});

	it("lets grid rows grow to their content and overflow a fixed-height container", () => {
		const b = boxes(
			".g{display:grid;grid-template-columns:1fr 1fr;height:100px}.tall{height:160px}",
			'<div class="g"><div class="tall"></div><div class="short"></div></div>',
		);
		expect(b.g?.h).toBe(100);
		expect(b.tall).toMatchObject({ y: 0, h: 160 });
		// Items stretch to the row's height.
		expect(b.short).toMatchObject({ x: 500, h: 160 });
	});

	it("collapses empty auto-fit tracks", () => {
		const b = boxes(
			".g{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:20px}.g>div{height:10px}",
			'<div class="g"><div class="a"></div><div class="b"></div></div>',
		);
		expect([b.a?.w, b.b?.x, b.b?.w]).toEqual([490, 510, 490]);
	});

	it("sizes an image from its file and a set height", () => {
		const svg =
			'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="89" viewBox="0 0 200 89"></svg>';
		const b = boxes(
			".logo{height:56px;width:auto}.free{width:auto}",
			'<div><img class="logo" src="/l.svg"><img class="free" src="/l.svg"></div>',
			{
				"l.svg": svg,
			},
		);
		expect(b.logo).toMatchObject({ w: 126, h: 56 });
		expect(b.free).toMatchObject({ w: 200, h: 89 });
	});

	it("sizes a fit-content flex item to its content instead of stretching it", () => {
		const b = boxes(
			".c{display:flex;flex-direction:column}.f{width:fit-content}",
			'<div class="c"><span class="f">short</span></div>',
		);
		expect(b.f?.w).toBeLessThan(200);
	});

	it("lays out an inline-block on the line, by its baseline and vertical-align", () => {
		const line = (va: string) =>
			boxes(
				`.p{line-height:20px}.ib{display:inline-block;width:50px;height:40px;vertical-align:${va}}`,
				'<p class="p">x <span class="ib"></span> y</p>',
			);
		const base = line("baseline");
		expect(base.ib).toMatchObject({ w: 50, h: 40 });
		// An empty inline-block sits on the baseline by its bottom edge: the line grows to hold it.
		expect(base.p?.h).toBeGreaterThan(40);
		expect((base.ib?.y ?? 0) - (base.p?.y ?? 0)).toBe(0);
		// Lowered 10px: 30px above the baseline and 10px below it, which the line holds.
		expect(line("-10px").p?.h).toBe(40);
	});

	it("keeps nowrap text on one line", () => {
		const b = boxes(
			".n{width:50px;line-height:20px;white-space:nowrap}.w{width:50px;line-height:20px}",
			'<p class="n">aaa bbb ccc</p><p class="w">aaa bbb ccc</p>',
		);
		expect(b.n?.h).toBe(20);
		expect(b.w?.h).toBeGreaterThan(20);
	});

	it("reads the font shorthand", () => {
		const b = boxes(".f{font:30px/60px T}", '<p class="f">x</p>');
		expect(b.f?.h).toBe(60);
	});

	it("indents the first line by text-indent (a hanging bullet)", () => {
		const b = boxes(
			".p{padding-left:30px;text-indent:-30px}.ib{display:inline-block;width:30px;height:10px}",
			'<p class="p"><span class="ib"></span>text</p>',
		);
		expect(b.ib?.x).toBe(b.p?.x);
	});

	it("sizes table columns: <col> widths, set widths no narrower than the content", () => {
		const b = boxes(
			"table{border-spacing:0;width:600px}.n{width:10px;white-space:nowrap}",
			'<table><colgroup><col style="width:200px"><col><col></colgroup><tr><td class="a">a</td><td class="n">wide words</td><td class="c">c</td></tr></table>',
		);
		// The fixed columns get their widths (the nowrap one its content's); the auto column the rest.
		expect(b.a?.w).toBe(200);
		expect(b.n?.w).toBeGreaterThan(10);
		expect((b.a?.w ?? 0) + (b.n?.w ?? 0) + (b.c?.w ?? 0)).toBe(600);
		expect(b.c?.w).toBe(600 - 200 - (b.n?.w ?? 0));
	});
});

describe("layout core, continued", () => {
	it("evaluates calc() with products, quotients and nested calc()", () => {
		const b = boxes(
			".a{width:calc(10px * calc(1 + 2));height:calc((100px - 20px) / 4)}.b{width:calc(50% - 2 * 10px);height:10px}",
			'<div class="a"></div><div class="b"></div>',
		);
		expect(b.a).toMatchObject({ w: 30, h: 20 });
		expect(b.b?.w).toBe(480);
	});

	it("gives each item its own column with grid-auto-flow: column", () => {
		const b = boxes(
			".g{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:20px}",
			'<div class="g"><div class="x">a</div><div class="y">b</div><div class="z">c</div></div>',
		);
		expect(b.x?.w).toBe(320);
		expect(b.y?.x).toBe(340);
		expect(b.z?.y).toBe(b.x?.y);
	});

	it("lines items up by their baselines with align-items: baseline", () => {
		const b = boxes(
			".r{display:flex;align-items:baseline}.big{font-size:40px;line-height:40px}.small{font-size:10px;line-height:10px}",
			'<div class="r"><span class="big">A</span><span class="small">a</span></div>',
		);
		// The small item sits low, its baseline on the big one's.
		expect(b.small?.y).toBeGreaterThan((b.big?.y ?? 0) + 20);
	});

	it("resolves a grid item's max-height: 100% against a definite lone row", () => {
		const b = boxes(
			".g{display:grid;height:100px}.i{max-height:100%;overflow:hidden}.tall{height:300px}",
			'<div class="g"><div class="i"><div class="tall"></div></div></div>',
		);
		expect(b.i?.h).toBe(100);
	});

	it("breaks before an inline box after a space, padding and all", () => {
		const b = boxes(
			".p{width:200px;line-height:20px}code{padding:0 20px}",
			'<p class="p">aaaa bbbb cccc <code>dddd</code></p>',
		);
		expect(b.p?.h).toBe(40);
	});
});

describe("spec rules found by comparing with Chromium (#363)", () => {
	it("weights flex shrinking by the inner base size (css-flexbox-1 §9.7)", () => {
		const items = [
			item({ base: 600, hypo: 600, edges: 0 }),
			item({ base: 400, hypo: 400, edges: 100 }),
		];
		resolveFlexibleLengths(items, 600, 0);
		// 400px too wide, shared 600 : 300 (the second item's inner size).
		expect(items[0]?.target).toBeCloseTo(600 - (400 * 600) / 900, 5);
		expect(items[1]?.target).toBeCloseTo(400 - (400 * 300) / 900, 5);
	});

	it("floors a flex item's base size at its padding and border (§9.2)", () => {
		const b = boxes(
			".r{display:flex;width:300px;height:10px}.a,.b{flex:1 1 0%}.b{border:solid;border-width:0 10px}",
			'<div class="r"><div class="a"></div><div class="b"></div></div>',
		);
		// The 20px of border come first; the rest is shared equally.
		expect(b.a?.w).toBe(140);
		expect(b.b?.w).toBe(160);
	});

	it("shrinks a flex item with a set width down to its content (§4.5)", () => {
		const b = boxes(
			".r{display:flex;width:100px;height:10px}.a,.b{width:80px}",
			'<div class="r"><div class="a"></div><div class="b"></div></div>',
		);
		expect(b.a?.w).toBe(50);
	});

	it("adds up a nowrap flex row's items for its min-content width", () => {
		const b = boxes(
			".m{width:min-content}.r{display:flex}.x,.y{width:50px;flex-shrink:0;height:10px}",
			'<div class="m"><div class="r"><div class="x"></div><div class="y"></div></div></div>',
		);
		expect(b.m?.w).toBe(100);
	});

	it("keeps a column item's width within its max-width", () => {
		const b = boxes(".i{width:100%;max-width:200px;height:10px}", '<div class="i"></div>');
		expect(b.i?.w).toBe(200);
	});

	it("gives a border with a style and no width the medium width (3px)", () => {
		const b = boxes(
			".d{box-sizing:content-box;border-style:solid;height:10px;width:10px}",
			'<div class="d"></div>',
		);
		expect(b.d).toMatchObject({ w: 16, h: 16 });
	});

	it("passes inherited properties down even without an initial value of ours", () => {
		const b = boxes(
			".p{width:60px;line-height:20px;word-break:break-word}",
			'<p class="p"><span>aaaaaaaaaaaaaaaaaaaaaaaa</span></p>',
		);
		expect(b.p?.h).toBeGreaterThan(20);
	});

	it("takes an absolutely positioned inline-flex box out of the line", () => {
		const b = boxes(
			".p{position:relative;line-height:20px}.a{position:absolute;display:inline-flex;right:0;top:0;width:30px;height:50px}",
			'<p class="p">text<span class="a"></span></p>',
		);
		expect(b.p?.h).toBe(20);
		expect(b.a?.x).toBe(970);
	});

	it("sizes implicit rows by grid-auto-rows: minmax(0, 1fr)", () => {
		const b = boxes(
			".g{display:grid;grid-auto-rows:minmax(0,1fr);height:100px}.t{height:300px}",
			'<div class="g"><div class="i"><div class="t"></div></div></div>',
		);
		expect(b.i?.h).toBe(100);
	});

	it("resolves a grid item's percentage margins against its grid area", () => {
		const b = boxes(
			".g{display:grid;grid-template-columns:200px 200px;width:400px;line-height:20px}.i{margin-left:50%}",
			'<div class="g"><div class="i">aa bb</div></div>',
		);
		// 50% of the 200px area leaves 100px: one line (of the 400px grid it would leave none).
		expect(b.i).toMatchObject({ x: 100, w: 100 });
		expect(b.g?.h).toBe(20);
	});

	it("keeps a flex item image within max-width, its minimum too (§4.5)", () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"></svg>';
		const b = boxes(
			".r{display:flex;width:300px}.i{max-width:100%}",
			'<div class="r"><img class="i" src="/i.svg"></div>',
			{ "i.svg": svg },
		);
		expect(b.i).toMatchObject({ w: 300, h: 150 });
	});

	it("narrows an image limited by max-height to keep its ratio (CSS 2 §10.4)", () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"></svg>';
		const b = boxes(
			".r{display:flex}.i{max-height:100px}",
			'<div class="r"><img class="i" src="/i.svg"></div>',
			{ "i.svg": svg },
		);
		expect(b.i).toMatchObject({ w: 200, h: 100 });
	});
});

/**
 * Measures CJK characters a full em wide and the rest half an em, so the
 * punctuation rules are tested whatever fonts the machine has (the test
 * font has no CJK glyphs).
 */
class FullwidthFonts extends FontRegistry {
	override width(_face: unknown, size: number, text: string, letterSpacing = 0): number {
		let w = 0;
		for (const ch of text) w += (ch.codePointAt(0) ?? 0) >= 0x3000 ? size : size / 2;
		return w + letterSpacing * [...text].length;
	}
}

describe("text-spacing-trim", () => {
	const fonts = new FullwidthFonts();
	fonts.add("T", 400, false, FONT);
	const style = {
		face: fonts.pick("T", 400, false),
		size: 20,
		lineHeight: 20,
		letterSpacing: 0,
		whiteSpace: "normal" as const,
		color: "#000",
		alpha: 1,
		breakWord: false,
	};
	const lay = (text: string, w = 1000) =>
		layoutLines([{ kind: "text", text, style, nodeIndex: 0 }], w, style, "left", fonts);
	const lines = (text: string, w: number) => lay(text, w).fragments.map((f) => f.line);

	it("sets punctuation after punctuation half-width", () => {
		expect(lay("」「").width).toBe(30);
		expect(lay("。」").width).toBe(30);
		expect(lay("あ「").width).toBe(40);
	});

	it("lets closing brackets at a line end go half-width to fit, not a full stop", () => {
		// 35px for 40px of text: the 」 loses its blank half and the line holds.
		expect(lines("あ」", 35)).toEqual([0]);
		expect(lines("あ）", 35)).toEqual([0]);
		// A full stop keeps its width: the line breaks before the character it sticks to.
		expect(lines("ああ。", 55)).toEqual([0, 1]);
	});
});

describe("line breaking", () => {
	const fonts = new FullwidthFonts();
	fonts.add("T", 400, false, FONT);
	const style = {
		face: fonts.pick("T", 400, false),
		size: 20,
		lineHeight: 20,
		letterSpacing: 0,
		whiteSpace: "normal" as const,
		color: "#000",
		alpha: 1,
		breakWord: false,
	};
	const text = (t: string, nodeIndex: number) => ({
		kind: "text" as const,
		text: t,
		style,
		nodeIndex,
	});

	it("breaks before small kana and the prolonged sound mark (line-break: normal)", () => {
		expect(layoutLines([text("ップー", 0)], 0, style, "left", fonts).width).toBe(20);
	});

	it("breaks between text nodes, and goes back to the last opportunity", () => {
		// 日本<b>語</b>: CJK across nodes may break.
		expect(layoutLines([text("日本", 0), text("語", 1)], 0, style, "left", fonts).width).toBe(20);
		// あい（<code>ABCD</code>: no break after （, so the line breaks before it.
		const r = layoutLines([text("あい（", 0), text("ABCD", 1)], 70, style, "left", fonts);
		expect(r.fragments.map((f) => [f.text, f.line])).toEqual([
			["あい", 0],
			["（", 1],
			["ABCD", 1],
		]);
	});
});
