import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, type ThemeColors, themeColors } from "../src/pptx/export/theme-map";

/** A theme stylesheet's custom properties, as a computed style holds them. */
const variablesOf = (css: string) =>
	new Map(
		[...css.matchAll(/(--color-[a-z]+)\s*:\s*([^;]+);/g)].map((m) => [
			m[1] ?? "",
			(m[2] ?? "").trim(),
		]),
	);

describe("theme colours from the theme's CSS variables", () => {
	// What PowerPoint's theme got for the built-in themes before it read their CSS.
	const builtIn: Record<string, ThemeColors> = {
		default: DEFAULT_THEME,
		dark: {
			bg: "0F172A",
			fg: "F8FAFC",
			primary: "60A5FA",
			secondary: "94A3B8",
			accent: "FBBF24",
			muted: "1E293B",
		},
		minimal: {
			bg: "FAFAFA",
			fg: "18181B",
			primary: "18181B",
			secondary: "71717A",
			accent: "18181B",
			muted: "F4F4F5",
		},
		corporate: {
			bg: "FFFFFF",
			fg: "1E3A5F",
			primary: "0066CC",
			secondary: "5A7A9A",
			accent: "FF6B35",
			muted: "E8F0F8",
		},
		gradient: {
			bg: "0A0A0F",
			fg: "F0F0FF",
			primary: "818CF8",
			secondary: "94A3B8",
			accent: "F472B6",
			muted: "1E1E2E",
		},
		rose: {
			bg: "FFF1F2",
			fg: "881337",
			primary: "E11D48",
			secondary: "9F1239",
			accent: "FB7185",
			muted: "FFE4E6",
		},
		forest: {
			bg: "F0FDF4",
			fg: "14532D",
			primary: "16A34A",
			secondary: "166534",
			accent: "4ADE80",
			muted: "DCFCE7",
		},
	};
	for (const [name, expected] of Object.entries(builtIn))
		it(`reads the built-in "${name}" theme as before`, () => {
			const css = readFileSync(
				join(__dirname, "..", "src", "styles", "themes", `${name}.css`),
				"utf-8",
			);
			expect(themeColors(variablesOf(css))).toEqual(expected);
		});

	it("reads a template or plugin theme's own colours, in any colour syntax (#312)", () => {
		const colors = themeColors(
			new Map([
				["--color-background", "#0d1117"],
				["--color-primary", "oklch(0.623 0.214 259.815)"],
				["--color-accent", "rgb(255 0 0)"],
			]),
		);
		expect(colors).toMatchObject({ bg: "0D1117", primary: "2B7FFF", accent: "FF0000" });
		// Variables it doesn't set: the default theme's.
		expect(colors.fg).toBe(DEFAULT_THEME.fg);
	});

	it("falls back to the default theme without a style", () => {
		expect(themeColors(undefined)).toEqual(DEFAULT_THEME);
	});
});
