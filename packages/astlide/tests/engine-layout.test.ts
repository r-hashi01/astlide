import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FontRegistry, layoutPage } from "@astlide/engine";
import { describe, expect, it } from "vitest";

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
});
