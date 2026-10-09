/**
 * Fonts and inline text layout: pick a font face for a style, measure glyph
 * advances (with kerning) via fontkit, and break inline content into lines
 * the way Chromium does for `white-space: normal | pre*`.
 */

import { readFileSync } from "node:fs";
import * as fontkit from "fontkit";

export interface FontFace {
	family: string;
	weight: number;
	italic: boolean;
	font: fontkit.Font;
	/** The font file (absent on fallback fonts, which are system fonts). */
	file?: string;
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
			if (cp > 0x20 && !face.font.hasGlyphForCodePoint(cp)) {
				f = this.fallbacks.find((fb) => fb.font.hasGlyphForCodePoint(cp)) ?? face;
			}
			const last = out[out.length - 1];
			if (last && last.face === f) last.text += ch;
			else out.push({ face: f, text: ch });
		}
		return out;
	}

	/** Register a TTF / OTF file for a family name. */
	add(family: string, weight: number, italic: boolean, path: string): void {
		const font = fontkit.create(readFileSync(path)) as fontkit.Font;
		this.faces.push({ family: family.toLowerCase(), weight, italic, font, file: path });
	}

	/** Files of the registered faces (fallbacks excluded). */
	files(): string[] {
		return this.faces.flatMap((f) => (f.file ? [f.file] : []));
	}

	/** First family in a CSS `font-family` list that we have, nearest weight. */
	pick(familyList: string, weight: number, italic: boolean): FontFace {
		const families = familyList.split(",").map((f) =>
			f
				.trim()
				.replace(/^["']|["']$/g, "")
				.toLowerCase(),
		);
		for (const fam of families) {
			const candidates = this.faces.filter((f) => f.family === fam);
			if (candidates.length === 0) continue;
			const styled = candidates.filter((f) => f.italic === italic);
			const pool = styled.length ? styled : candidates;
			return pool.reduce((best, f) =>
				Math.abs(f.weight - weight) < Math.abs(best.weight - weight) ? f : best,
			);
		}
		const fallback = this.faces[0];
		if (!fallback) throw new Error("no fonts registered");
		return fallback;
	}

	/** Advance width of `text` in px (kerning applied), plus letter spacing per character. */
	width(face: FontFace, size: number, text: string, letterSpacing = 0): number {
		const key = `${face.family}|${face.weight}|${face.italic}|${size}|${letterSpacing}|${text}`;
		const hit = this.widthCache.get(key);
		if (hit !== undefined) return hit;
		let w = letterSpacing * [...text].length;
		for (const seg of this.segments(face, text)) {
			let units: number;
			try {
				const run = seg.face.font.layout(seg.text);
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
	size: number;
	/** Used line height in px. */
	lineHeight: number;
	letterSpacing: number;
	whiteSpace: string;
	color: string;
	/** Effective opacity (element and ancestors). */
	alpha: number;
}

/** A piece of inline content: text from one text node, or spacing from an inline box edge. */
export type InlineItem =
	| { kind: "text"; text: string; style: InlineStyle; nodeIndex: number }
	| { kind: "space"; width: number }
	/** Start / end of an inline element's box (background, border, padding). */
	| { kind: "open" | "close"; id: number };

/** The part of an inline element's box on one line, relative to the block's content box. */
export interface PlacedInlineBox {
	id: number;
	x: number;
	w: number;
	/** Baseline of the line, from the top of the content box. */
	baseline: number;
}

export interface PlacedFragment {
	nodeIndex: number;
	text: string;
	x: number;
	/** Top of the glyph content area (ascent + descent), relative to the block's content box. */
	y: number;
	w: number;
	h: number;
	/** Index of the line box in the block. */
	line: number;
	/** Top and height of that line box (relative to the block's content box). */
	lineTop: number;
	lineHeight: number;
	style: InlineStyle;
}

export interface LineBreakResult {
	width: number;
	height: number;
	fragments: PlacedFragment[];
	inlineBoxes: PlacedInlineBox[];
}

interface Word {
	text: string;
	style: InlineStyle | null;
	nodeIndex: number;
	width: number;
	/** Whitespace after which a line may break (and which hangs at line end). */
	space: boolean;
	/** Preserved white space (pre*): kept at line starts. */
	pre?: boolean;
	/** A break opportunity right before this word (e.g. after a hyphen). */
	breakBefore?: boolean;
	forcedBreak?: boolean;
	/** Zero-width marker for an inline box edge. */
	edge?: { kind: "open" | "close"; id: number };
}

/**
 * Lay out inline items into lines of at most `maxWidth` px. `strut` is the
 * block container's own inline style (it sets the minimum line height).
 */
export function layoutLines(
	items: InlineItem[],
	maxWidth: number,
	strut: InlineStyle,
	textAlign: string,
	fonts: FontRegistry,
): LineBreakResult {
	// 1. Collapse white space (white-space: normal) and split into words.
	const words: Word[] = [];
	let prevSpace = true; // leading white space at the start of the block collapses away
	for (const item of items) {
		if (item.kind === "space") {
			words.push({ text: "", style: null, nodeIndex: -1, width: item.width, space: false });
			continue;
		}
		if (item.kind !== "text") {
			words.push({
				text: "",
				style: null,
				nodeIndex: -1,
				width: 0,
				space: false,
				edge: { kind: item.kind, id: item.id },
			});
			continue;
		}
		const pre = /^(pre|pre-wrap|break-spaces)$/.test(item.style.whiteSpace);
		const preLine = item.style.whiteSpace === "pre-line";
		const text = pre ? item.text : item.text.replace(preLine ? /[ \t]+/g : /\s+/g, " ");
		const parts = text.split(pre || preLine ? /(\n|[ \t]+)/ : /( )/);
		for (const part of parts) {
			if (part === "") continue;
			if (part === "\n") {
				words.push({
					text: "",
					style: item.style,
					nodeIndex: item.nodeIndex,
					width: 0,
					space: false,
					forcedBreak: true,
				});
				prevSpace = true;
				continue;
			}
			const isSpace = /^[ \t]+$/.test(part);
			if (isSpace && !pre && prevSpace) continue;
			// UAX #14: a line may break after a hyphen that follows a letter, before a letter.
			const pieces = isSpace || pre ? [part] : part.split(/(?<=[^\s-]-)(?=[A-Za-z])/);
			pieces.forEach((piece, k) => {
				const w = fonts.width(item.style.face, item.style.size, piece, item.style.letterSpacing);
				words.push({
					text: piece,
					style: item.style,
					nodeIndex: item.nodeIndex,
					width: w,
					space: isSpace,
					pre,
					breakBefore: k > 0,
				});
			});
			prevSpace = isSpace;
		}
	}

	// 2. Greedy line breaking at spaces.
	type Line = { words: Word[]; width: number };
	const lines: Line[] = [];
	let line: Line = { words: [], width: 0 };
	const contentWidth = (l: Line) => {
		let w = l.width;
		for (let i = l.words.length - 1; i >= 0 && l.words[i]?.space; i--) w -= l.words[i]?.width ?? 0;
		return w;
	};
	for (const word of words) {
		if (word.forcedBreak) {
			lines.push(line);
			line = { words: [], width: 0 };
			continue;
		}
		if (!word.space && line.words.length > 0 && line.width + word.width > maxWidth + 0.01) {
			const prev = line.words[line.words.length - 1];
			// Break after white space, or at a break opportunity inside a word.
			if (prev?.space || word.breakBefore) {
				lines.push(line);
				line = { words: [], width: 0 };
			}
		}
		if (word.space && !word.pre && line.words.length === 0) continue; // collapsible spaces at line start
		line.words.push(word);
		line.width += word.width;
	}
	if (line.words.length) lines.push(line);

	// 3. Vertical layout per line: baseline alignment with half-leading.
	const fragments: PlacedFragment[] = [];
	const inlineBoxes: PlacedInlineBox[] = [];
	/** Inline boxes still open at the end of the previous line (continue on the next). */
	let carried: number[] = [];
	let y = 0;
	let maxW = 0;
	for (const [li, l] of lines.entries()) {
		const inlineStyles = [strut, ...l.words.flatMap((w) => (w.style ? [w.style] : []))];
		let above = 0;
		let below = 0;
		for (const s of inlineStyles) {
			const m = verticalMetrics(s.face, s.size);
			// Chromium floors the ascent-side half-leading (the rest goes below).
			const leading = s.lineHeight - (m.ascent + m.descent);
			const half = Math.floor(leading / 2);
			above = Math.max(above, m.ascent + half);
			below = Math.max(below, m.descent + leading - half);
		}
		const lineHeight = above + below;
		const baseline = y + above;
		const lw = contentWidth(l);
		maxW = Math.max(maxW, lw);
		const offset =
			textAlign === "center"
				? (maxWidth - lw) / 2
				: textAlign === "right" || textAlign === "end"
					? maxWidth - lw
					: 0;
		// Merge consecutive words of the same text node into fragments.
		let x = offset;
		let frag: PlacedFragment | null = null;
		const trailing = l.words.length - [...l.words].reverse().findIndex((w) => !w.space);
		const openAt = new Map<number, number>(carried.map((id) => [id, offset]));
		l.words.forEach((w, i) => {
			const hanging = i >= trailing;
			if (w.edge) {
				if (w.edge.kind === "open") openAt.set(w.edge.id, x);
				else {
					const start = openAt.get(w.edge.id) ?? offset;
					openAt.delete(w.edge.id);
					inlineBoxes.push({ id: w.edge.id, x: start, w: x - start, baseline });
				}
				frag = null;
				return;
			}
			if (!w.style || w.nodeIndex < 0) {
				frag = null;
				x += w.width;
				return;
			}
			if (frag && frag.nodeIndex === w.nodeIndex) {
				if (!hanging) {
					frag.text += w.text;
					// Like a Range's box: up to the last non-space character.
					if (!w.space) frag.w = x + w.width - frag.x;
				}
			} else if (!w.space) {
				const m = verticalMetrics(w.style.face, w.style.size);
				frag = {
					nodeIndex: w.nodeIndex,
					text: w.text,
					x,
					y: baseline - m.ascent,
					w: w.width,
					h: m.ascent + m.descent,
					line: li,
					lineTop: y,
					lineHeight,
					style: w.style,
				};
				fragments.push(frag);
			}
			x += w.width;
		});
		// Boxes that continue onto the next line end at this line's content end.
		carried = [...openAt.keys()];
		for (const [id, start] of openAt)
			inlineBoxes.push({ id, x: start, w: offset + lw - start, baseline });
		y += lineHeight;
	}
	for (const f of fragments) f.text = f.text.trimEnd();
	return { width: maxW, height: y, fragments, inlineBoxes };
}
