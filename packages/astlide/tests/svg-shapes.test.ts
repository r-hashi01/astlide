import { parseDocument } from "htmlparser2";
import { describe, expect, it } from "vitest";
import type { RectSpec, ShapeSpec, TextBoxSpec } from "../src/cli/pptx/ooxml-writer";
import { type SvgNode, svgToShapes } from "../src/cli/pptx/svg-shapes";

const BOX = { x: 100, y: 50, w: 200, h: 100, color: "112233", fontFace: "Inter", fontSize: 16 };
const K = 0.01; // inches per px

function shapes(markup: string) {
	const root = parseDocument(markup, { xmlMode: true }).children.find((c) => c.type === "tag");
	return svgToShapes(root as SvgNode, BOX, K);
}

describe("svgToShapes", () => {
	it("maps viewBox units onto the box (scaled, centered)", () => {
		const [rect] = shapes(
			'<svg viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" fill="#ff0000"/></svg>',
		) as RectSpec[];
		// 100×100 into 200×100 with "meet": scale 1, centered horizontally.
		expect(rect).toMatchObject({ type: "rect", fill: "FF0000" });
		expect(rect?.x).toBeCloseTo(1.5);
		expect(rect?.y).toBeCloseTo(0.5);
		expect(rect?.w).toBeCloseTo(1);
	});

	it("turns marker-end into an arrowhead and currentColor into the CSS color", () => {
		const [line] = shapes(
			'<svg viewBox="0 0 200 100"><defs><marker id="a"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>' +
				'<line x1="0" y1="50" x2="200" y2="50" stroke="currentColor" stroke-width="2" marker-end="url(#a)"/></svg>',
		) as ShapeSpec[];
		expect(line?.stroke).toMatchObject({ color: "112233", tail: true, head: false });
		expect(line?.geom).toEqual({
			paths: [
				{
					closed: false,
					points: [
						[0, 0],
						[2, 0],
					],
				},
			],
		});
	});

	it("flattens curves and keeps text editable", () => {
		const out = shapes(
			'<svg viewBox="0 0 200 100"><path d="M0 0 C 50 100, 150 100, 200 0" stroke="black" fill="none"/>' +
				'<text x="100" y="50" text-anchor="middle" font-size="20">Hi</text></svg>',
		);
		const path = out?.[0] as ShapeSpec;
		expect(typeof path.geom === "object" && path.geom.paths[0]?.points.length).toBe(9);
		const text = out?.[1] as TextBoxSpec;
		expect(text).toMatchObject({ type: "textbox", align: "center" });
		expect(text.runs[0]?.text).toBe("Hi");
	});

	it("gives up on what shapes can't express", () => {
		expect(
			shapes(
				'<svg><defs><linearGradient id="g"/></defs><rect width="10" height="10" fill="url(#g)"/></svg>',
			),
		).toBeNull();
		expect(shapes('<svg><path d="M0 0 A 10 10 0 0 1 20 20"/></svg>')).toBeNull();
		expect(shapes('<svg><image href="x.png"/></svg>')).toBeNull();
	});
});
