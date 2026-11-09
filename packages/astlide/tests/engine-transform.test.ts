import { describe, expect, it } from "vitest";
import { boxTransform, mapRect } from "../src/engine/transform";

const px = (v: string, basis: number) => {
	const m = v.trim().match(/^(-?[\d.]+)(px|%)?$/);
	if (!m) return Number.NaN;
	return m[2] === "%" ? (Number(m[1]) / 100) * basis : Number(m[1]);
};
const box = { x: 100, y: 100, w: 200, h: 100 };

describe("boxTransform", () => {
	it("scales about the center by default, and about transform-origin", () => {
		const center = boxTransform("scale(0.5)", "", box, px);
		expect(center && mapRect(center, box)).toEqual({ x: 150, y: 125, w: 100, h: 50 });
		const corner = boxTransform("scale(0.5)", "left top", box, px);
		expect(corner && mapRect(corner, box)).toEqual({ x: 100, y: 100, w: 100, h: 50 });
		const keywords = boxTransform("scale(0.5)", "top left", box, px);
		expect(keywords && mapRect(keywords, box)).toEqual({ x: 100, y: 100, w: 100, h: 50 });
	});

	it("translates, with percentages of the box's own size", () => {
		const t = boxTransform("translate(10px, 50%)", "", box, px);
		expect(t && mapRect(t, box)).toEqual({ x: 110, y: 150, w: 200, h: 100 });
	});

	it("reads UnoCSS's chain of functions, identity parts included", () => {
		const t = boxTransform(
			"translateX(0) translateY(0) translateZ(0) rotate(0) skewX(0) scaleX(0.9) scaleY(0.9) scaleZ(1)",
			"",
			box,
			px,
		);
		expect(t && mapRect(t, box)).toEqual({ x: 110, y: 105, w: 180, h: 90 });
	});

	it("leaves out the identity, rotations and skews", () => {
		expect(boxTransform("none", "", box, px)).toBeNull();
		expect(boxTransform("scale(1) translate(0, 0)", "", box, px)).toBeNull();
		expect(boxTransform("rotate(10deg) scale(2)", "", box, px)).toBeNull();
		expect(boxTransform("matrix(1, 0.2, 0, 1, 0, 0)", "", box, px)).toBeNull();
	});
});
