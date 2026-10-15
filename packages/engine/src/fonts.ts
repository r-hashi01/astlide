/**
 * Font files for the families a page asks for: collected from its CSS
 * (`font-family` values and `--font-*` custom properties). Fonts the site
 * ships itself come from its `@font-face` rules; the rest are fetched as
 * TrueType from Google Fonts (which serves .ttf to non-browser clients) and
 * cached on disk.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
	const withoutFaces = css.replace(/@font-face\s*\{[^}]*\}/g, "");
	for (const m of withoutFaces.matchAll(
		/(?:font-family|--font-(?!size|weight|style)[\w-]+)\s*:\s*([^;}]+)/gi,
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
	for (const [, body = ""] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
		const prop = (name: string) =>
			body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i"))?.[1]?.trim();
		const family = prop("font-family")?.replace(/^["']|["']$/g, "");
		// Not prop(): data: URLs inside src contain ";".
		const src = body.match(/(?:^|;)\s*src\s*:\s*((?:url\([^)]*\)|[^;])+)/i)?.[1];
		if (!family || !src) continue;
		const url = [
			...src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)\s*format\(\s*["']?(truetype|opentype)/gi),
		][0]?.[1];
		if (!url || /^(https?:|data:)/.test(url)) continue;
		const path = url.split(/[?#]/)[0] ?? "";
		// Root-relative, possibly under Astro's `base`.
		const file = [join(dist, path), join(dist, path.replace(/^\/[^/]+/, ""))].find((p) =>
			existsSync(p),
		);
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
