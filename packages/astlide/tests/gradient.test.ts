import { parseLinearGradient } from "@astlide/engine";
import { describe, expect, it } from "vitest";

describe("parseLinearGradient", () => {
	it("reads an angle and stop positions", () => {
		const g = parseLinearGradient("linear-gradient(135deg, #818cf8, #f472b6 80%)");
		expect(g?.angle).toBe(135);
		expect(g?.stops.map((s) => [s.color.hex, s.pos])).toEqual([
			["818cf8", 0],
			["f472b6", 0.8],
		]);
	});

	it("defaults to top-to-bottom, spreads missing positions and reads side keywords", () => {
		const g = parseLinearGradient("linear-gradient(red, rgba(0, 0, 255, 0.5), green)");
		expect(g?.angle).toBe(180);
		expect(g?.stops.map((s) => s.pos)).toEqual([0, 0.5, 1]);
		expect(g?.stops[1]?.color.alpha).toBe(0.5);
		expect(parseLinearGradient("linear-gradient(to right, red, blue)")?.angle).toBe(90);
	});

	it("rejects what it can't read", () => {
		expect(parseLinearGradient("radial-gradient(red, blue)")).toBeNull();
		expect(parseLinearGradient("linear-gradient(red)")).toBeNull();
	});
});
