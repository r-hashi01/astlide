/**
 * Font files for the families a page asks for: collected from its CSS
 * (`font-family` values and `--font-*` custom properties). Fonts the site
 * ships itself come from its `@font-face` rules; the rest are fetched as
 * TrueType from Google Fonts (which serves .ttf to non-browser clients) and
 * cached on disk.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { distFile } from "./dist";
import type { FontRegistry } from "./text";

const GENERIC = new Set([
	"serif",
	"sans-serif",
	"monospace",
	"cursive",
	"fantasy",
	"system-ui",
	"ui-sans-serif",
	"ui-serif",
	"ui-monospace",
	"-apple-system",
	"blinkmacsystemfont",
	"emoji",
	"math",
]);

/** Family names mentioned in CSS text, in order of appearance (generic keywords excluded). */
export function familiesIn(css: string): string[] {
	const out = new Set<string>();
	// font-family values and --font-* custom properties that hold family lists
	// (not --font-size-* / --font-weight-*); @font-face blocks are skipped.
	let withoutFaces = "";
	let from = 0;
	for (const face of fontFaceBlocks(css)) {
		withoutFaces += css.slice(from, face.start);
		from = face.end;
	}
	withoutFaces += css.slice(from);
	for (const m of withoutFaces.matchAll(
		// No \s* before the value: [^;}] takes the spaces (overlapping quantifiers backtrack).
		/(?:font-family|--font-(?!size|weight|style)[\w-]+)\s*:([^;}]+)/gi,
	)) {
		for (const raw of (m[1] ?? "").split(",")) {
			const name = raw
				.trim()
				.replace(/^["']|["']$/g, "")
				.replace(/\)+$/, "");
			if (!name || name.includes("(") || /^[\d.]/.test(name) || GENERIC.has(name.toLowerCase()))
				continue;
			out.add(name);
		}
	}
	return [...out];
}

/**
 * Register the site's own `@font-face` fonts that have a TrueType / OpenType
 * source in `dist` (woff / woff2 can't be read). Returns the families
 * registered.
 */
export function loadFontFaces(fonts: FontRegistry, css: string, dist: string): Set<string> {
	const loaded = new Set<string>();
	for (const { body } of fontFaceBlocks(css)) {
		const prop = (name: string) =>
			body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:([^;]+)`, "i"))?.[1]?.trim();
		const family = prop("font-family")?.replace(/^["']|["']$/g, "");
		// Not prop(): data: URLs inside src contain ";".
		const src = declarationValue(body, "src");
		if (!family || !src) continue;
		const url = [
			...src.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)\s*format\(\s*["']?(truetype|opentype)/gi),
		][0]?.[1];
		if (!url || /^(https?:|data:)/.test(url)) continue;
		const path = url.split(/[?#]/)[0] ?? "";
		// Root-relative, possibly under Astro's `base`.
		const file = distFile(dist, path);
		if (!file) continue;
		const weight = prop("font-weight") ?? "400";
		const w = /bold/i.test(weight) ? 700 : Number.parseInt(weight, 10) || 400;
		fonts.add(family, w, /italic|oblique/i.test(prop("font-style") ?? ""), file);
		loaded.add(family);
	}
	return loaded;
}

/**
 * Register `families` from Google Fonts (regular weights + italics where
 * available). Families Google doesn't have are skipped and returned.
 */
export async function loadGoogleFonts(
	fonts: FontRegistry,
	families: string[],
	cacheDir: string,
	weights = [400, 500, 600, 700],
): Promise<string[]> {
	mkdirSync(cacheDir, { recursive: true });
	const missing: string[] = [];
	for (const family of families) {
		let found = false;
		for (const w of weights) {
			for (const italic of [false, true]) {
				const file = join(cacheDir, `${family.replace(/\W+/g, "-")}-${w}${italic ? "i" : ""}.ttf`);
				if (!existsSync(file)) {
					const axis = italic ? `ital,wght@1,${w}` : `wght@${w}`;
					const css = await fetch(
						`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${axis}`,
					).catch(() => null);
					if (!css?.ok) continue;
					const url = (await css.text()).match(/url\((https:[^)]+\.ttf)\)/)?.[1];
					if (!url) continue;
					const ttf = await fetch(url);
					if (!ttf.ok) continue;
					writeFileSync(file, Buffer.from(await ttf.arrayBuffer()));
				}
				// Google returns the nearest weight when one doesn't exist; that's fine.
				fonts.add(family, w, italic, file);
				found = true;
			}
		}
		if (!found) missing.push(family);
	}
	return missing;
}

/**
 * The value of a declaration in a rule body, up to its `;` — a `;` inside
 * `url(…)` (data: URLs) doesn't end it. Scanned, not matched: a regex with
 * alternatives that overlap backtracks on long values.
 */
function declarationValue(body: string, name: string): string | undefined {
	const at = body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:`, "i"));
	if (!at || at.index === undefined) return undefined;
	let depth = 0;
	let i = at.index + at[0].length;
	const start = i;
	for (; i < body.length; i++) {
		const c = body[i];
		if (c === "(") depth++;
		else if (c === ")") depth = Math.max(0, depth - 1);
		else if (c === ";" && depth === 0) break;
	}
	return body.slice(start, i).trim() || undefined;
}

/**
 * The `@font-face { … }` blocks of a style sheet: where each starts and
 * ends, and its body. A linear scan: the regex /@font-face\s*\{[^}]*\}/
 * is quadratic on runs of unclosed blocks.
 */
function fontFaceBlocks(css: string): { start: number; end: number; body: string }[] {
	const out: { start: number; end: number; body: string }[] = [];
	let at = css.indexOf("@font-face");
	while (at !== -1) {
		let i = at + "@font-face".length;
		while (i < css.length && /\s/.test(css[i] ?? "")) i++;
		if (css[i] === "{") {
			const close = css.indexOf("}", i + 1);
			// No "}" after this one: no later block can be closed either.
			if (close === -1) break;
			out.push({ start: at, end: close + 1, body: css.slice(i + 1, close) });
			at = css.indexOf("@font-face", close + 1);
		} else at = css.indexOf("@font-face", i);
	}
	return out;
}
