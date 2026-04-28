/**
 * Astlide → pptxgenjs theme colour mappings.
 *
 * All colour values are in "RRGGBB" hex format (no leading #) as expected by
 * pptxgenjs.  The values mirror the CSS variables defined in
 * `src/styles/themes/*.css`.
 */

export interface ThemeColors {
	bg: string;
	fg: string;
	primary: string;
	secondary: string;
	accent: string;
	muted: string;
	codeBg: string;
	codeFg: string;
}

export const THEMES: Record<string, ThemeColors> = {
	default: {
		bg: "FFFFFF",
		fg: "1A1A1A",
		primary: "3B82F6",
		secondary: "64748B",
		accent: "F59E0B",
		muted: "F1F5F9",
		codeBg: "1E1E1E",
		codeFg: "D4D4D4",
	},
	dark: {
		bg: "0F172A",
		fg: "F8FAFC",
		primary: "60A5FA",
		secondary: "94A3B8",
		accent: "FBBF24",
		muted: "1E293B",
		codeBg: "0D1117",
		codeFg: "F8FAFC",
	},
	minimal: {
		bg: "FAFAFA",
		fg: "18181B",
		primary: "18181B",
		secondary: "71717A",
		accent: "18181B",
		muted: "F4F4F5",
		codeBg: "1E1E1E",
		codeFg: "D4D4D4",
	},
	corporate: {
		bg: "FFFFFF",
		fg: "1E3A5F",
		primary: "0066CC",
		secondary: "5A7A9A",
		accent: "FF6B35",
		muted: "E8F0F8",
		codeBg: "1E1E1E",
		codeFg: "D4D4D4",
	},
	gradient: {
		bg: "0A0A0F",
		fg: "F0F0FF",
		primary: "818CF8",
		secondary: "94A3B8",
		accent: "F472B6",
		muted: "1E1E2E",
		codeBg: "13131F",
		codeFg: "F0F0FF",
	},
	rose: {
		bg: "FFF1F2",
		fg: "881337",
		primary: "E11D48",
		secondary: "9F1239",
		accent: "FB7185",
		muted: "FFE4E6",
		codeBg: "1E0A10",
		codeFg: "FFF1F2",
	},
	forest: {
		bg: "F0FDF4",
		fg: "14532D",
		primary: "16A34A",
		secondary: "166534",
		accent: "4ADE80",
		muted: "DCFCE7",
		codeBg: "052E16",
		codeFg: "F0FDF4",
	},
};

export function getTheme(name?: string): ThemeColors {
	return THEMES[(name ?? "default").toLowerCase()] ?? THEMES.default;
}

/**
 * Normalise a hex colour to the pptxgenjs "RRGGBB" format (no #, uppercase).
 * Returns null when the string is not a recognised hex colour.
 */
export function hexColor(val: string): string | null {
	const m = val.trim().match(/^#?([0-9a-fA-F]{6})$/);
	return m ? m[1].toUpperCase() : null;
}

/**
 * Try to extract a solid hex colour from a CSS value.
 * Handles: "#RRGGBB", "RRGGBB", "rgb(r,g,b)".
 * Returns null when no solid colour can be determined (e.g. gradients, images).
 */
export function parseSolidColor(css: string): string | null {
	const trimmed = css.trim();
	const direct = hexColor(trimmed);
	if (direct) return direct;

	const rgb = trimmed.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
	if (rgb) {
		return [rgb[1], rgb[2], rgb[3]]
			.map((n) => Number.parseInt(n, 10).toString(16).padStart(2, "0"))
			.join("")
			.toUpperCase();
	}
	return null;
}
