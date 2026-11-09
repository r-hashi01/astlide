/**
 * The `font` option resolved into the stylesheet DeckLayout links and the
 * origins it preconnects to.
 *
 * @module
 */

import type { FontOption } from "@astlide/astro";

/** Resolved font config that DeckLayout consumes — `null` means "inject nothing". */
export interface ResolvedFont {
	href: string;
	preconnect: string[];
}

const DEFAULT_FONT: ResolvedFont = {
	href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap",
	preconnect: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
};

export function resolveFontOption(font: FontOption | undefined): ResolvedFont | null {
	if (font === false) return null;
	if (font === undefined) return DEFAULT_FONT;
	if (typeof font === "string") {
		return { href: font, preconnect: inferPreconnects(font) };
	}
	const href = font.href ?? DEFAULT_FONT.href;
	return { href, preconnect: font.preconnect ?? inferPreconnects(href) };
}

function inferPreconnects(href: string): string[] {
	try {
		const { origin } = new URL(href);
		// Google Fonts also serves font files from fonts.gstatic.com — preconnect to both.
		if (origin === "https://fonts.googleapis.com") return [origin, "https://fonts.gstatic.com"];
		return [origin];
	} catch {
		return [];
	}
}
