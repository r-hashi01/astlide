/**
 * Fonts: theme font references resolved, and CSS font stacks.
 *
 * @module
 */

import type { SlideContext } from "./presentation";

/** @internal */
export function fontStack(face: string): string {
	// Single quotes: this goes inside style="…". The name is already safe (resolveFont).
	const name = safeFontName(face);
	return name ? `'${name}', sans-serif` : "sans-serif";
}

/**
 * @internal A font name from a PowerPoint file, made safe to put anywhere in
 * CSS or HTML (a quoted CSS string, a style attribute, a <style> element):
 * letters, digits, marks, spaces and `-_.+` only — every real font name
 * ("Calibri Light", "游ゴシック", "Noto Sans JP") — at most 64 characters.
 * Undefined when nothing is left.
 */
export function safeFontName(name: string | undefined): string | undefined {
	const clean = (name ?? "")
		.replace(/[^\p{L}\p{N}\p{M} \-_.+]/gu, "")
		.replace(/ {2,}/g, " ")
		.trim()
		.slice(0, 64)
		.trim();
	return clean || undefined;
}

/** @internal */
export function resolveFont(
	face: string | undefined,
	fonts: SlideContext["fonts"],
): string | undefined {
	if (!face) return undefined;
	if (face.startsWith("+mj")) return fonts.major;
	if (face.startsWith("+mn")) return fonts.minor;
	return face;
}
