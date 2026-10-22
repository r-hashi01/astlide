import { parseLinearGradient, parseStripes } from "@astlide/core/engine";
import { describe, expect, it } from "vitest";
import { stripePreset } from "../src/cli/pptx/export";

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

describe("parseStripes", () => {
	it("reads a hatch as imported PowerPoint pattern fills draw it", () => {
		const s = parseStripes("repeating-linear-gradient(45deg, #5a2e1e 0 1px, transparent 1px 4px)");
		expect(s).toMatchObject({ angle: 45, period: 4, color: { hex: "5a2e1e" } });
		expect(
			parseStripes("repeating-linear-gradient(-45deg, #000 0 1px, transparent 1px 8px)")?.angle,
		).toBe(315);
		expect(parseStripes("repeating-linear-gradient(red, blue 10%)")).toBeNull();
		expect(parseStripes("linear-gradient(red, blue)")).toBeNull();
	});

	it("maps to the DrawingML preset pattern of the same lines", () => {
		expect(stripePreset(0, 4)).toBe("horz");
		expect(stripePreset(90, 8)).toBe("ltVert");
		expect(stripePreset(45, 4)).toBe("dnDiag");
		expect(stripePreset(315, 8)).toBe("ltUpDiag");
	});
});
