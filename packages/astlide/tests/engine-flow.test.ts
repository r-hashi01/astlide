import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FontRegistry, layoutPage } from "../src/engine";
import { type FlexItem, resolveFlexibleLengths } from "../src/engine/flow";
import { layoutLines } from "../src/engine/text";

/** A font every install has (KaTeX ships TrueType), for text. */
const FONT = join(
	createRequire(import.meta.url).resolve("katex/package.json"),
	"..",
	"dist",
	"fonts",
	"KaTeX_Main-Regular.ttf",
);

// These tests lay out with the constraint-based core (flow.ts).
beforeEach(() => {
	process.env.ASTLIDE_ENGINE_CORE = "flow";
});
afterEach(() => {
	delete process.env.ASTLIDE_ENGINE_CORE;
});

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

describe("text-spacing-trim", () => {
	it("sets punctuation after punctuation half-width", () => {
		const fonts = new FontRegistry();
		fonts.add("T", 400, false, FONT);
		const face = fonts.pick("T", 400, false);
		const style = {
			face,
			size: 20,
			lineHeight: 20,
			letterSpacing: 0,
			whiteSpace: "normal",
			color: "#000",
			alpha: 1,
			breakWord: false,
		};
		const width = (text: string) =>
			layoutLines([{ kind: "text", text, style, nodeIndex: 0 }], 1000, style, "left", fonts).width;
		const full = width("「");
		// Only a fullwidth glyph has a blank half to trim.
		if (full < 18) return;
		expect(width("」「")).toBeCloseTo(width("」") + full - 10, 5);
		expect(width("。」")).toBeCloseTo(width("。") - 10 + width("」"), 5);
	});
});
