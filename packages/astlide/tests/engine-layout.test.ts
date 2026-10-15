import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FontRegistry, layoutPage } from "@astlide/engine";
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
