/**
 * The fonts a page is laid out with, set up one way for every caller (the
 * PPTX export, `check_deck`): its own `@font-face` fonts, the rest from
 * Google Fonts, an emoji fallback, and a font to measure East Asian text.
 *
 * @module
 */

import { existsSync, readFileSync } from "node:fs";
import { familiesIn, googleFontLinks, loadFontFaces, loadGoogleFonts, weightsIn } from "./fonts";
import { FontRegistry, METRIC_COMPATIBLE } from "./text";

/** Japanese / Chinese / Korean text. */
export const CJK_TEXT = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ가-힯]/;
/** Font families for East Asian text, by name. */
export const CJK_FAMILY =
	/\b(JP|KR|SC|TC|HK|CJK)\b|Gothic|Mincho|Hiragino|Meiryo|Yu ?(Gothic|Mincho)|BIZ UD|M PLUS|Kosugi|Sawarabi|Zen (Kaku|Maru|Old)|Source Han|Pretendard|游|ゴシック|明朝|源ノ/i;
/** The East Asian font PPTX files name when the CSS doesn't: installed with Office on Windows and macOS. */
export const DEFAULT_EA_FONT = "Yu Gothic";
/** An element the browser styles with its form-control font. */
const FORM_CONTROL = /<(button|input|select|textarea)[\s>]/i;
/** Measures emoji where the system has it (macOS). */
const EMOJI_FONT = "/System/Library/Fonts/Apple Color Emoji.ttc";

/** A page's fonts, ready for {@link layoutPage}. */
export interface PageFonts {
	fonts: FontRegistry;
	/** The East Asian font to name: the CSS's CJK family, else {@link DEFAULT_EA_FONT}. */
	eaFont: string;
	/** Families the page names that Google Fonts doesn't have (and that have no metric-compatible clone). */
	missing: string[];
	/** The page has East Asian text but no font to measure it with (Noto Sans JP unavailable). */
	noCjkFont: boolean;
}

/** A Google Fonts family's regular face (downloaded into `cacheDir`), or null. */
async function googleFontFile(family: string, cacheDir: string): Promise<string | null> {
	const registry = new FontRegistry();
	const missing = await loadGoogleFonts(registry, [family], cacheDir, [400]);
	return missing.length ? null : (registry.files()[0] ?? null);
}

/**
 * Load the fonts of the page `html` (whose stylesheets are `css`, from
 * {@link pageCss}): the site's own fonts in `dist` first, the others from
 * Google Fonts (cached in `cacheDir`) — or, for proprietary families like
 * Helvetica, their metric-compatible clones — the emoji fallback, and for East Asian
 * text the CSS's CJK font if loaded, else Noto Sans JP.
 */
export async function loadPageFonts(
	html: string,
	css: string,
	dist: string,
	cacheDir: string,
): Promise<PageFonts> {
	const fonts = new FontRegistry();
	const local = loadFontFaces(fonts, css, dist);
	const source = readFileSync(html, "utf-8");
	// The faces the page links from Google Fonts: no italics unless it asks for them.
	const linked = googleFontLinks(source);
	// Form controls are in Arial (the browser's own style for them).
	const families = familiesIn(css);
	if (FORM_CONTROL.test(source) && !families.some((f) => f.toLowerCase() === "arial"))
		families.push("Arial");
	const notFound = await loadGoogleFonts(
		fonts,
		families.filter((f) => !local.has(f)),
		cacheDir,
		weightsIn(css),
		(family) => linked.get(family.toLowerCase())?.italic ?? true,
	);
	const clones = [
		...new Set(notFound.flatMap((f) => METRIC_COMPATIBLE[f.toLowerCase()] ?? [])),
	].filter((clone) => !fonts.has(clone));
	await loadGoogleFonts(fonts, clones, cacheDir, weightsIn(css));
	const missing = notFound.filter((f) => {
		const clone = METRIC_COMPATIBLE[f.toLowerCase()];
		return !clone || !fonts.has(clone);
	});
	if (existsSync(EMOJI_FONT)) fonts.addFallback(EMOJI_FONT);
	const eaFont = familiesIn(css).find((f) => CJK_FAMILY.test(f)) ?? DEFAULT_EA_FONT;
	let noCjkFont = false;
	if (CJK_TEXT.test(source)) {
		const loaded = fonts.pick(`"${eaFont}"`, 400, false);
		const measure =
			loaded.family === eaFont.toLowerCase() && loaded.file
				? loaded.file
				: await googleFontFile("Noto Sans JP", cacheDir);
		if (measure) fonts.addFallback(measure);
		else noCjkFont = true;
	}
	return { fonts, eaFont, missing, noCjkFont };
}
