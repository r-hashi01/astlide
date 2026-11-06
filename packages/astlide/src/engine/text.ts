/**
 * Fonts and inline text layout: pick a font face for a style, measure glyph
 * advances (with kerning) via fontkit, and break inline content into lines
 * the way Chromium does for `white-space: normal | pre*`.
 */

import { readFileSync } from "node:fs";
import * as fontkit from "fontkit";
import type { Keyword } from "./properties";

export interface FontFace {
	family: string;
	weight: number;
	italic: boolean;
	font: fontkit.Font;
	/** The font file (absent on fallback fonts, which are system fonts). */
	file?: string;
	/**
	 * The other families of the `font-family` list it was chosen from, in
	 * order: characters this face lacks are looked up in them first (CSS
	 * Fonts §5.4), then in the registered fallbacks.
	 */
	chain?: FontFace[];
	/**
	 * The `unicode-range` the page serves this family with: characters
	 * outside it come from the next font even when the file has them.
	 */
	ranges?: [number, number][];
}

/** Common fonts standing for CSS generic families, best first. */
const SANS = [
	"inter",
	"helvetica neue",
	"helvetica",
	"arial",
	"roboto",
	"noto sans",
	"open sans",
	"liberation sans",
	"dejavu sans",
];
const SERIF = ["georgia", "times new roman", "noto serif", "liberation serif", "dejavu serif"];
const MONO = [
	"jetbrains mono",
	"fira code",
	"sf mono",
	"menlo",
	"consolas",
	"liberation mono",
	"dejavu sans mono",
];
const GENERIC_FAMILIES: Record<string, string[]> = {
	"sans-serif": SANS,
	"system-ui": SANS,
	"ui-sans-serif": SANS,
	"-apple-system": SANS,
	blinkmacsystemfont: SANS,
	serif: SERIF,
	"ui-serif": SERIF,
	monospace: MONO,
	"ui-monospace": MONO,
};

/** Whether a face draws a character: the font has it and the page serves it (`unicode-range`). */
function covers(face: FontFace, cp: number): boolean {
	return (
		face.font.hasGlyphForCodePoint(cp) &&
		(!face.ranges || face.ranges.some(([from, to]) => cp >= from && cp <= to))
	);
}

export class FontRegistry {
	private faces: FontFace[] = [];
	private fallbacks: FontFace[] = [];
	private widthCache = new Map<string, number>();

	/** A font used for characters the chosen face lacks (e.g. emoji), like the OS fallback. */
	addFallback(path: string, postscriptName?: string): void {
		const created = fontkit.create(readFileSync(path)) as fontkit.Font | fontkit.FontCollection;
		const font =
			"fonts" in created
				? ((postscriptName ? created.getFont(postscriptName) : created.fonts[0]) as fontkit.Font)
				: created;
		this.fallbacks.push({
			family: font.familyName.toLowerCase(),
			weight: 400,
			italic: false,
			font,
		});
	}

	/** Split text into runs by the face that renders each character. */
	segments(face: FontFace, text: string): { face: FontFace; text: string }[] {
		const out: { face: FontFace; text: string }[] = [];
		for (const ch of text) {
			const cp = ch.codePointAt(0) ?? 0;
			let f = face;
			if (cp > 0x20 && !covers(face, cp)) {
				f =
					face.chain?.find((c) => covers(c, cp)) ??
					this.fallbacks.find((fb) => covers(fb, cp)) ??
					face;
			}
			const last = out[out.length - 1];
			if (last && last.face === f) last.text += ch;
			else out.push({ face: f, text: ch });
		}
		return out;
	}

	/** Register a TTF / OTF file for a family name. */
	add(
		family: string,
		weight: number,
		italic: boolean,
		path: string,
		ranges?: [number, number][],
	): void {
		const font = fontkit.create(readFileSync(path)) as fontkit.Font;
		this.faces.push({ family: family.toLowerCase(), weight, italic, font, file: path, ranges });
	}

	/** Files of the registered faces (fallbacks excluded). */
	files(): string[] {
		return this.faces.flatMap((f) => (f.file ? [f.file] : []));
	}

	/** First family in a CSS `font-family` list that we have, nearest weight. */
	pick(familyList: string, weight: number, italic: boolean): FontFace {
		return this.resolve(familyList, weight, italic).face;
	}

	/**
	 * The face for a CSS `font-family` list: the first listed family we have,
	 * a generic family (`sans-serif`, `monospace` …) as a common font of its
	 * kind we have, else a sans-serif one. When none of the listed families
	 * was available, `requested` is the first one named — the font the page
	 * asked for, which a document can still name (PowerPoint has it where
	 * it's installed) while text is measured with `face`.
	 */
	resolve(
		familyList: string,
		weight: number,
		italic: boolean,
	): { face: FontFace; requested?: string } {
		const names = familyList
			.split(",")
			.map((f) => f.trim().replace(/^["']|["']$/g, ""))
			.filter(Boolean);
		const nearest = (fam: string): FontFace | undefined => {
			const candidates = this.faces.filter((f) => f.family === fam);
			if (candidates.length === 0) return undefined;
			const styled = candidates.filter((f) => f.italic === italic);
			const pool = styled.length ? styled : candidates;
			return pool.reduce((best, f) =>
				Math.abs(f.weight - weight) < Math.abs(best.weight - weight) ? f : best,
			);
		};
		// A named family we have is the font; a generic one stands in for the first named.
		let requested: string | undefined;
		const found: FontFace[] = [];
		/** The first face found is a family the list names (not a generic's stand-in). */
		let named = false;
		for (const name of names) {
			const fam = name.toLowerCase();
			const generic = GENERIC_FAMILIES[fam];
			const face = generic ? generic.map(nearest).find(Boolean) : nearest(fam);
			if (face) {
				if (found.length === 0) named = !generic;
				// Generic families stand for system fonts we don't have: only the
				// families the list names back up the first one.
				if (!found.includes(face) && (found.length === 0 || !generic)) found.push(face);
			} else if (!generic && found.length === 0) requested ??= name;
		}
		if (named) requested = undefined;
		const primary = found[0] ?? SANS.map(nearest).find(Boolean) ?? this.faces[0];
		if (!primary) throw new Error("no fonts registered");
		// The rest of the list backs up characters the first face lacks.
		const chain = found.slice(1);
		if (chain.length === 0) return { face: primary, ...(requested ? { requested } : {}) };
		const key = `${primary.family}|${primary.weight}|${primary.italic}|${chain.map((c) => `${c.family}:${c.weight}`).join(">")}`;
		let face = this.chained.get(key);
		if (!face) {
			face = { ...primary, chain };
			this.chained.set(key, face);
		}
		return { face, ...(requested ? { requested } : {}) };
	}

	/** Faces with a fallback chain, by list (so a list keeps one face object). */
	private readonly chained = new Map<string, FontFace>();

	/**
	 * Advance width of `text` in px (kerning applied, and OpenType `features`
	 * such as tabular numbers), plus letter spacing per character.
	 */
	width(
		face: FontFace,
		size: number,
		text: string,
		letterSpacing = 0,
		features?: readonly string[],
	): number {
		const chain = face.chain?.map((c) => `${c.family}:${c.weight}`).join(">") ?? "";
		const key = `${face.family}|${face.weight}|${face.italic}|${chain}|${size}|${letterSpacing}|${features?.join(",") ?? ""}|${text}`;
		const hit = this.widthCache.get(key);
		if (hit !== undefined) return hit;
		let w = letterSpacing * [...text].length;
		for (const seg of this.segments(face, text)) {
			let units: number;
			try {
				const run = features?.length
					? seg.face.font.layout(seg.text, [...features])
					: seg.face.font.layout(seg.text);
				units = run.positions.reduce((sum, p) => sum + p.xAdvance, 0);
			} catch {
				// fontkit can fail decoding some glyph outlines; advances alone come
				// from hmtx (no kerning — fine for the monospace fonts this hits).
				units = advancesFromHmtx(seg.face.font, seg.text);
			}
			w += (units / seg.face.font.unitsPerEm) * size;
		}
		this.widthCache.set(key, w);
		return w;
	}
}

function advancesFromHmtx(font: fontkit.Font, text: string): number {
	const f = font as unknown as {
		hmtx: { metrics: { get(i: number): { advance: number } | undefined }; advances?: number[] };
		hhea: { numberOfMetrics: number };
		_cmapProcessor: { lookup(cp: number): number };
	};
	let units = 0;
	for (const ch of text) {
		const gid = f._cmapProcessor.lookup(ch.codePointAt(0) ?? 0);
		const m = f.hmtx.metrics.get(Math.min(gid, f.hhea.numberOfMetrics - 1));
		units += m?.advance ?? 0;
	}
	return units;
}

/**
 * Vertical metrics as Chromium uses them: ascent / descent from hhea (or
 * OS/2 typo with USE_TYPO_METRICS), each rounded to whole px.
 */
export function verticalMetrics(
	face: FontFace,
	size: number,
): { ascent: number; descent: number; lineGap: number } {
	const f = face.font as fontkit.Font & { "OS/2"?: { fsSelection?: { useTypoMetrics?: boolean } } };
	const upm = f.unitsPerEm;
	const useTypo = Boolean(f["OS/2"]?.fsSelection?.useTypoMetrics);
	const os2 = (
		f as unknown as { "OS/2": { typoAscender: number; typoDescender: number; typoLineGap: number } }
	)["OS/2"];
	const asc = useTypo ? os2.typoAscender : f.ascent;
	const desc = useTypo ? -os2.typoDescender : -f.descent;
	const gap = useTypo ? os2.typoLineGap : f.lineGap;
	return {
		ascent: Math.round((asc / upm) * size),
		descent: Math.round((desc / upm) * size),
		lineGap: Math.round((gap / upm) * size),
	};
}

// ── Inline layout ────────────────────────────────────────────────────────

export interface InlineStyle {
	face: FontFace;
	/** The family the CSS asked for, when none of its families was available (see {@link FontRegistry.resolve}). */
	requested?: string;
	size: number;
	/** Used line height in px. */
	lineHeight: number;
	letterSpacing: number;
	whiteSpace: Keyword<"white-space">;
	color: string;
	/** Effective opacity (element and ancestors). */
	alpha: number;
	/** Words too long for a line may break anywhere (overflow-wrap: break-word / anywhere, word-break: break-all). */
	breakWord?: boolean;
	/** OpenType features to apply (from `font-variant-numeric`, `font-feature-settings`). */
	features?: string[];
	/** Text decorations in effect (the element's or an ancestor's). */
	underline?: boolean;
	strike?: boolean;
}
