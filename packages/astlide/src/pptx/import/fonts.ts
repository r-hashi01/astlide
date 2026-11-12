/**
 * Fonts: theme font references resolved, and CSS font stacks.
 *
 * @module
 */

import type { SlideContext } from "./presentation";

/**
 * @internal A CSS font stack: the faces in order — the Latin font, then the
 * East Asian one, which draws the characters the first lacks (as PowerPoint
 * uses a run's `a:ea` font for East Asian text).
 */
export function fontStack(...faces: (string | undefined)[]): string {
	// Single quotes: this goes inside style="…". The names are made safe here.
	const names = [...new Set(faces.map((f) => safeFontName(f)).filter(Boolean))];
	return [...names.map((n) => `'${n}'`), "sans-serif"].join(", ");
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
	// +mj-lt / +mn-lt: the theme's Latin fonts; +mj-ea / +mn-ea: its East Asian ones.
	if (face.startsWith("+mj"))
		return face === "+mj-ea" ? (fonts.majorEa ?? fonts.major) : fonts.major;
	if (face.startsWith("+mn"))
		return face === "+mn-ea" ? (fonts.minorEa ?? fonts.minor) : fonts.minor;
	return face;
}
