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
	whiteSpace: string;
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

/** A piece of inline content: text from one text node, or spacing from an inline box edge. */
export type InlineItem =
	| { kind: "text"; text: string; style: InlineStyle; nodeIndex: number }
	| { kind: "space"; width: number }
	/** Start / end of an inline element's box (background, border, padding). */
	| { kind: "open" | "close"; id: number }
	/**
	 * An inline-level box laid out as a whole (inline-block, inline-flex …):
	 * its margin box size and baseline (from its top), set before line layout.
	 */
	| AtomicInline;

export interface AtomicInline {
	kind: "atomic";
	box: object;
	/** Whether lines may break around it (its parent's `white-space`). */
	wraps: boolean;
	width: number;
	height: number;
	baseline: number;
}

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
	/** Where each atomic inline's margin box went (top left, relative to the content box). */
	atomics: { item: AtomicInline; x: number; y: number }[];
	/** Each line's baseline, from the top of the content box. */
	baselines: number[];
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
	atomic?: AtomicInline;
	/** Lines may break here (`white-space` isn't `nowrap` / `pre`). */
	wraps?: boolean;
}

/**
 * How far a line may run past its box before it breaks: Yoga rounds layout
 * to 1/64px, so a box sized to its text can come out that much narrower than
 * the text measured into it.
 */
const FIT = 1 / 32;

/** Kana, CJK ideographs and symbols, Hangul, full-width forms: a line may break around each one. */
const CJK =
	/[\u2e80-\u2fff\u3000-\u30ff\u3100-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]|[\u{20000}-\u{3134f}]/u;
/** Never at the start of a line (kinsoku): closing punctuation, small kana, iteration and prolonged marks. */
const NO_BREAK_BEFORE =
	/[、。，．・：；？！‼⁇⁈⁉）〕］｝〉》」』】〙〗〟’”｠»ゝゞヽヾー々〻ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰ-ㇿ〜～…‥゛゜)\]}.,:;!?%]/u;
/** Never at the end of a line: opening brackets and quotes. */
const NO_BREAK_AFTER = /[（〔［｛〈《「『【〘〖〝‘“｟«([{]/u;

/**
 * A word's break opportunities (UAX #14, the cases slides need): after a
 * hyphen that follows a letter and precedes one, and around CJK characters —
 * Japanese, Chinese and Korean text has no spaces to break at — except where
 * kinsoku forbids it.
 */
function breakPieces(word: string): string[] {
	const chars = [...word];
	const pieces: string[] = [];
	let piece = "";
	for (const [i, ch] of chars.entries()) {
		const prev = chars[i - 1];
		if (prev !== undefined && piece !== "") {
			const hyphen = prev === "-" && /[^\s-]/.test(chars[i - 2] ?? "") && /[A-Za-z]/.test(ch);
			const cjk =
				(CJK.test(prev) || CJK.test(ch)) && !NO_BREAK_BEFORE.test(ch) && !NO_BREAK_AFTER.test(prev);
			if (hyphen || cjk) {
				pieces.push(piece);
				piece = "";
			}
		}
		piece += ch;
	}
	pieces.push(piece);
	return pieces;
}

/** Fullwidth punctuation, by how `text-spacing-trim` treats it. */
const OPEN_PUNCT = /[「『（〔［｛〈《【〘〖〝]/u;
const CLOSE_PUNCT = /[」』）〕］｝〉》】〙〗〟、。，．]/u;
const MIDDLE_PUNCT = /[・：；]/u;

/**
 * `text-spacing-trim: normal`'s trim-adjacent (CSS Text 4 §9.2): fullwidth
 * punctuation next to other punctuation loses its blank half — an opening
 * bracket after punctuation, closing punctuation before closing or middle
 * punctuation (`」「` is 1.5em, not 2em).
 */
function trimAdjacent(words: Word[], fonts: FontRegistry): void {
	const chars: { word: Word; ch: string }[] = [];
	const run = () => {
		for (const [i, { word, ch }] of chars.entries()) {
			const style = word.style;
			if (!style) continue;
			const prev = chars[i - 1]?.ch ?? "";
			const next = chars[i + 1]?.ch ?? "";
			const trim =
				(OPEN_PUNCT.test(ch) &&
					(OPEN_PUNCT.test(prev) || CLOSE_PUNCT.test(prev) || MIDDLE_PUNCT.test(prev))) ||
				(CLOSE_PUNCT.test(ch) && (CLOSE_PUNCT.test(next) || MIDDLE_PUNCT.test(next)));
			// Only a fullwidth glyph has a blank half.
			if (trim && fonts.width(style.face, style.size, ch, 0) >= style.size * 0.9)
				word.width -= style.size / 2;
		}
		chars.length = 0;
	};
	for (const word of words) {
		// White space, forced breaks and atomic inlines separate the punctuation.
		if (word.space || word.forcedBreak || word.atomic || (word.width && !word.style)) run();
		else if (word.style) for (const ch of word.text) chars.push({ word, ch });
	}
	run();
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
	/** `text-indent`: the first line starts this far in. */
	indent = 0,
): LineBreakResult {
	// 1. Collapse white space (white-space: normal) and split into words.
	const words: Word[] = [];
	let prevSpace = true; // leading white space at the start of the block collapses away
	for (const item of items) {
		if (item.kind === "space") {
			words.push({ text: "", style: null, nodeIndex: -1, width: item.width, space: false });
			continue;
		}
		if (item.kind === "atomic") {
			// A line may break before and after one (like U+FFFC); spaces after it are kept.
			words.push({
				text: "",
				style: null,
				nodeIndex: -1,
				width: item.width,
				space: false,
				breakBefore: true,
				atomic: item,
				wraps: item.wraps,
			});
			prevSpace = false;
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
			const wraps = !/^(pre|nowrap)$/.test(item.style.whiteSpace);
			const pieces = isSpace || !wraps ? [part] : breakPieces(part);
			pieces.forEach((piece, k) => {
				const w = fonts.width(
					item.style.face,
					item.style.size,
					piece,
					item.style.letterSpacing,
					item.style.features,
				);
				words.push({
					text: piece,
					style: item.style,
					nodeIndex: item.nodeIndex,
					width: w,
					space: isSpace,
					pre,
					breakBefore: k > 0,
					wraps,
				});
			});
			prevSpace = isSpace;
		}
	}

	trimAdjacent(words, fonts);

	// 2. Greedy line breaking at spaces and at break opportunities inside words.
	type Line = { words: Word[]; width: number };
	const lines: Line[] = [];
	let line: Line = { words: [], width: 0 };
	const contentWidth = (l: Line) => {
		let w = l.width;
		for (let i = l.words.length - 1; i >= 0 && l.words[i]?.space; i--) w -= l.words[i]?.width ?? 0;
		return w;
	};
	/** Width for the line being filled (the first one is indented). */
	const room = () => maxWidth - (lines.length === 0 ? indent : 0);
	for (const word of words) {
		if (word.forcedBreak) {
			lines.push(line);
			line = { words: [], width: 0 };
			continue;
		}
		if (!word.space && line.words.length > 0 && line.width + word.width > room() + FIT) {
			const prev = line.words[line.words.length - 1];
			// Break after white space, or at a break opportunity inside a word.
			const after = (prev?.space || prev?.atomic) && prev.wraps !== false;
			// The white space (or atomic inline) before decides; inside a word, the word's own style.
			if (after || (word.breakBefore && word.wraps !== false)) {
				lines.push(line);
				line = { words: [], width: 0 };
			}
		}
		if (word.space && !word.pre && line.words.length === 0) continue; // collapsible spaces at line start
		// overflow-wrap: break-word — a word that still doesn't fit breaks between characters.
		let rest = word;
		while (
			!rest.space &&
			rest.wraps !== false &&
			rest.style?.breakWord &&
			line.width + rest.width > room() + FIT &&
			[...rest.text].length > 1
		) {
			const style = rest.style;
			const chars = [...rest.text];
			let n = 0;
			while (
				n < chars.length &&
				line.width +
					fonts.width(
						style.face,
						style.size,
						chars.slice(0, n + 1).join(""),
						style.letterSpacing,
						style.features,
					) <=
					room() + FIT
			)
				n++;
			if (n === 0 && line.words.length > 0) {
				lines.push(line);
				line = { words: [], width: 0 };
				continue;
			}
			n = Math.max(1, n);
			const head = chars.slice(0, n).join("");
			const tail = chars.slice(n).join("");
			const hw = fonts.width(style.face, style.size, head, style.letterSpacing, style.features);
			line.words.push({ ...rest, text: head, width: hw });
			line.width += hw;
			lines.push(line);
			line = { words: [], width: 0 };
			rest = {
				...rest,
				text: tail,
				width: fonts.width(style.face, style.size, tail, style.letterSpacing, style.features),
				breakBefore: true,
			};
		}
		line.words.push(rest);
		line.width += rest.width;
	}
	if (line.words.length) lines.push(line);

	// 3. Vertical layout per line: baseline alignment with half-leading.
	const fragments: PlacedFragment[] = [];
	const inlineBoxes: PlacedInlineBox[] = [];
	const atomics: LineBreakResult["atomics"] = [];
	const baselines: number[] = [];
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
		// vertical-align: baseline — the box's baseline on the line's.
		for (const w of l.words) {
			if (!w.atomic) continue;
			above = Math.max(above, w.atomic.baseline);
			below = Math.max(below, w.atomic.height - w.atomic.baseline);
		}
		const lineHeight = above + below;
		const baseline = y + above;
		baselines.push(baseline);
		const lw = contentWidth(l);
		const lead = li === 0 ? indent : 0;
		maxW = Math.max(maxW, lw + lead);
		const offset =
			lead +
			(textAlign === "center"
				? (maxWidth - lead - lw) / 2
				: textAlign === "right" || textAlign === "end"
					? maxWidth - lead - lw
					: 0);
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
			if (w.atomic) atomics.push({ item: w.atomic, x, y: baseline - w.atomic.baseline });
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
	return { width: maxW, height: y, fragments, inlineBoxes, atomics, baselines };
}
