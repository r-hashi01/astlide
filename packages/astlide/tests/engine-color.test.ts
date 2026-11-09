import { describe, expect, it } from "vitest";
import { parseColor } from "../src/engine/color";

/** Expected values are what Chromium paints (canvas pixels), as rrggbb. */
const cases: [string, string, number][] = [
	["hsl(120 100% 25%)", "008000", 1],
	["hwb(30 20% 10%)", "e68c33", 1],
	["oklch(0.623 0.214 259.815)", "2b7fff", 1],
	["oklch(62.7% 0.194 149.214)", "00a63e", 1],
	["oklch(0.5 0 0)", "636363", 1],
	["oklab(0.7 -0.1 0.1)", "77b253", 1],
	["lab(50% 40 -20)", "ab5a9a", 1],
	["lch(60% 50 120)", "769c3e", 1],
	["color-mix(in srgb, red 50%, blue)", "800080", 1],
	["color-mix(in oklab, #0033ff 10%, white)", "e4eeff", 1],
	["color-mix(in oklch, red, blue)", "ba00c2", 1],
	["color(srgb 0.2 0.4 0.6)", "336699", 1],
	["rebeccapurple", "663399", 1],
	["rgb(248 113 113 / 0.5)", "f87171", 0.5],
	["hsla(200, 50%, 40%, 0.5)", "337799", 0.5],
	["#0033ff80", "0033ff", 128 / 255],
	["color-mix(in srgb, #2563eb 25%, transparent)", "2563eb", 0.25],
	// Negative hues and angles past a turn.
	["hsl(-120 100% 50%)", "0000ff", 1],
	["hwb(-120 0% 0%)", "0000ff", 1],
	["hsl(480 100% 50%)", "00ff00", 1],
	["hsl(-0.25turn 100% 50%)", "8000ff", 1],
];

describe("CSS colours", () => {
	for (const [css, hex, alpha] of cases)
		it(css, () => {
			const c = parseColor(css);
			const channels = (h: string) => [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
			const got = channels(c?.hex ?? "------");
			// Within one step of Chromium's rounding.
			for (const [i, v] of channels(hex).entries())
				expect(Math.abs((got[i] ?? -9) - v)).toBeLessThanOrEqual(1);
			expect(c?.alpha).toBeCloseTo(alpha, 2);
		});

	it("leaves what it can't read", () => {
		expect(parseColor("var(--x)")).toBeNull();
		expect(parseColor("")).toBeNull();
		expect(parseColor("constructor")).toBeNull();
		expect(parseColor("__proto__")).toBeNull();
		// Hex colors have 3, 4, 6 or 8 digits.
		expect(parseColor("#12345")).toBeNull();
		expect(parseColor("#1234567")).toBeNull();
		expect(parseColor("transparent")).toEqual({ hex: "000000", alpha: 0 });
	});
});
