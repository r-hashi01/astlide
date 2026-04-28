import { describe, expect, it } from "vitest";
import { getTheme, hexColor, parseSolidColor, THEMES } from "../src/cli/pptx/theme-map";

// ── THEMES constant ──

describe("THEMES constant", () => {
	const themeNames = ["default", "dark", "minimal", "corporate", "gradient", "rose", "forest"];
	const colorFields = ["bg", "fg", "primary", "secondary", "accent", "muted", "codeBg", "codeFg"];

	it("contains all 7 themes", () => {
		expect(Object.keys(THEMES).sort()).toEqual(themeNames.sort());
	});

	for (const name of themeNames) {
		it(`"${name}" has all 8 color fields`, () => {
			const theme = THEMES[name];
			for (const field of colorFields) {
				expect(theme).toHaveProperty(field);
			}
		});
	}

	it("all color values are 6-character uppercase hex without #", () => {
		for (const [name, theme] of Object.entries(THEMES)) {
			for (const field of colorFields) {
				const val = theme[field as keyof typeof theme];
				expect(val, `${name}.${field} = "${val}"`).toMatch(/^[0-9A-F]{6}$/);
			}
		}
	});
});

// ── getTheme ──

describe("getTheme", () => {
	const themeNames = ["default", "dark", "minimal", "corporate", "gradient", "rose", "forest"];

	for (const name of themeNames) {
		it(`returns correct theme for "${name}"`, () => {
			expect(getTheme(name)).toBe(THEMES[name]);
		});
	}

	it("returns default theme when name is undefined", () => {
		expect(getTheme(undefined)).toBe(THEMES.default);
	});

	it("returns default theme when name is empty string", () => {
		expect(getTheme("")).toBe(THEMES.default);
	});

	it("returns default theme for unknown name", () => {
		expect(getTheme("nonexistent")).toBe(THEMES.default);
	});

	it("is case-insensitive", () => {
		expect(getTheme("Dark")).toBe(THEMES.dark);
		expect(getTheme("FOREST")).toBe(THEMES.forest);
		expect(getTheme("Minimal")).toBe(THEMES.minimal);
	});
});

// ── hexColor ──

describe("hexColor", () => {
	it('normalizes "#1e293b" to "1E293B"', () => {
		expect(hexColor("#1e293b")).toBe("1E293B");
	});

	it('normalizes "1e293b" (no #) to "1E293B"', () => {
		expect(hexColor("1e293b")).toBe("1E293B");
	});

	it('returns "ABCDEF" unchanged for uppercase input', () => {
		expect(hexColor("ABCDEF")).toBe("ABCDEF");
	});

	it("returns null for 3-char hex", () => {
		expect(hexColor("#FFF")).toBeNull();
	});

	it("returns null for invalid string", () => {
		expect(hexColor("not-a-color")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(hexColor("")).toBeNull();
	});

	it("trims whitespace", () => {
		expect(hexColor("  #1e293b  ")).toBe("1E293B");
	});
});

// ── parseSolidColor ──

describe("parseSolidColor", () => {
	it('parses "#1e293b" to "1E293B"', () => {
		expect(parseSolidColor("#1e293b")).toBe("1E293B");
	});

	it('parses "rgb(255,0,0)" to "FF0000"', () => {
		expect(parseSolidColor("rgb(255,0,0)")).toBe("FF0000");
	});

	it('parses "rgb(0, 128, 255)" (with spaces) to "0080FF"', () => {
		expect(parseSolidColor("rgb(0, 128, 255)")).toBe("0080FF");
	});

	it("returns null for linear-gradient", () => {
		expect(parseSolidColor("linear-gradient(to right, #1e293b, #0f172a)")).toBeNull();
	});

	it("returns null for url()", () => {
		expect(parseSolidColor("url(/images/bg.jpg)")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(parseSolidColor("")).toBeNull();
	});

	it("returns null for named CSS color", () => {
		expect(parseSolidColor("red")).toBeNull();
	});
});
