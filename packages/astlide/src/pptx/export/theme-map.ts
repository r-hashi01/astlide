/**
 * PowerPoint's theme colours (dk1 / lt1 / accents / hyperlink in
 * theme1.xml) for a deck: read from its theme's CSS variables
 * (`--color-background`, `--color-primary` …), so a built-in, template or
 * plugin theme gives its own colours. All values are "RRGGBB".
 */

import { type Color, parseColor } from "@astlide/core/engine";

export interface ThemeColors {
	bg: string;
	fg: string;
	primary: string;
	secondary: string;
	accent: string;
	muted: string;
}

/** The default theme's colours: for a variable a theme doesn't set. */
export const DEFAULT_THEME: ThemeColors = {
	bg: "FFFFFF",
	fg: "1A1A1A",
	primary: "3B82F6",
	secondary: "64748B",
	accent: "F59E0B",
	muted: "F1F5F9",
};

const VARIABLES: Record<keyof ThemeColors, string> = {
	bg: "--color-background",
	fg: "--color-foreground",
	primary: "--color-primary",
	secondary: "--color-secondary",
	accent: "--color-accent",
	muted: "--color-muted",
};

/** The theme colours of a slide's computed style (its custom properties are inherited from the theme). */
export function themeColors(style: ReadonlyMap<string, string> | undefined): ThemeColors {
	const out = { ...DEFAULT_THEME };
	for (const [key, variable] of Object.entries(VARIABLES) as [keyof ThemeColors, string][]) {
		const color: Color | null = parseColor(style?.get(variable));
		if (color && color.alpha > 0) out[key] = color.hex.toUpperCase();
	}
	return out;
}
