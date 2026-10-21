/**
 * PPTX → HTML slides: each slide of a PowerPoint file (or a Google Slides /
 * Keynote export) as HTML that reproduces it — text boxes, shapes, pictures
 * and tables at their positions on a 1920×1080 canvas, with the text kept as
 * text. Placeholders inherit position and text style from their layout and
 * master, as in PowerPoint; theme colors and fonts are resolved.
 *
 * The HTML is an Astlide `.html` slide body: it fills the whole slide
 * (including its padding) and carries the scoped resets it needs.
 *
 * @module
 */

import { posix } from "node:path";
import {
	type ColorContext,
	type ColorMap,
	colorChild,
	colorOf,
	cssColor,
	DEFAULT_COLOR_MAP,
	type ThemeColors,
} from "./color";
import { type Element, find, kid, kids, num, parseXml, path, textOf } from "./xml";
import { readZip, type ZipFiles } from "./zip";

export interface ImportedSlide {
	/** 1-based position in the presentation. */
	index: number;
	/** The slide as an HTML fragment (an Astlide `.html` slide body). */
	html: string;
	/** Speaker notes as plain text (paragraphs on separate lines). */
	notes: string;
	/** Text of the slide's title placeholder, if any. */
	title?: string;
	/** Hidden in the presentation (PowerPoint's "Hide slide"). */
	hidden: boolean;
}

export interface ImportedDeck {
	/** Slide size in EMU (914400 per inch). */
	width: number;
	height: number;
	slides: ImportedSlide[];
	title?: string;
	author?: string;
	/** The (first) master's theme: colors `rrggbb` by scheme name, heading / body fonts. */
	theme: { colors: ThemeColors; fonts: { heading?: string; body?: string } };
}

export interface PptxImportOptions {
	/**
	 * Where pictures and embedded fonts go: called once per file, returns the
	 * URL to use. Default: pictures as inline `data:` URLs (self-contained
	 * HTML) and embedded fonts left out (they'd be repeated in every slide).
	 */
	media?: (file: { name: string; data: Buffer; type: string }) => string;
	/** Canvas size in px (default 1920×1080); other slide ratios are letterboxed. */
	canvas?: { width: number; height: number };
}

const REL = {
	slide: "/slide",
	layout: "/slideLayout",
	master: "/slideMaster",
	theme: "/theme",
	notes: "/notesSlide",
	image: "/image",
	hyperlink: "/hyperlink",
	office: "/officeDocument",
};

const MIME: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	svg: "image/svg+xml",
	webp: "image/webp",
	bmp: "image/bmp",
};

interface Rel {
	type: string;
	target: string;
	external: boolean;
}

/** The OOXML package: parts by path, parsed XML and relationships on demand. */
export class Package {
	private parsed = new Map<string, Element | null>();
	private relsCache = new Map<string, Map<string, Rel>>();
	constructor(readonly files: ZipFiles) {}

	xml(part: string | undefined): Element | undefined {
		if (!part) return undefined;
		if (!this.parsed.has(part)) {
			const data = this.files.get(part);
			this.parsed.set(part, data ? parseXml(data.toString("utf-8")) : null);
		}
		return this.parsed.get(part) ?? undefined;
	}

	rels(part: string): Map<string, Rel> {
		const hit = this.relsCache.get(part);
		if (hit) return hit;
		const out = new Map<string, Rel>();
		const file = posix.join(posix.dirname(part), "_rels", `${posix.basename(part)}.rels`);
		for (const r of kids(this.xml(file), "Relationship")) {
			const external = r.attribs.TargetMode === "External";
			const target = r.attribs.Target ?? "";
			out.set(r.attribs.Id ?? "", {
				type: r.attribs.Type ?? "",
				external,
				target: external
					? target
					: target.startsWith("/")
						? target.slice(1)
						: posix.normalize(posix.join(posix.dirname(part), target)),
			});
		}
		this.relsCache.set(part, out);
		return out;
	}

	/** The first relationship of a kind (by type suffix). */
	relOf(part: string, type: string): Rel | undefined {
		for (const r of this.rels(part).values()) if (r.type.endsWith(type)) return r;
		return undefined;
	}
}

/** Most slides read from one presentation. */
export const MAX_SLIDES = 2000;

/** @internal */
export const esc = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attrEsc = (s: string) => esc(s).replace(/"/g, "&quot;");
/** @internal */
export const r2 = (n: number) => Math.round(n * 100) / 100;

/** @internal Paragraph / run properties as they cascade (level styles → shape → paragraph → run). */
export interface TextProps {
	algn?: string;
	marL?: number;
	indent?: number;
	lnSpcPct?: number;
	lnSpcPts?: number;
	spcBefPts?: number;
	spcBefPct?: number;
	spcAftPts?: number;
	spcAftPct?: number;
	bullet?:
		| { kind: "char"; char: string; font?: string }
		| { kind: "num"; type: string; start: number }
		| { kind: "none" };
	buClr?: Element;
	buSzPct?: number;
	sz?: number;
	b?: boolean;
	i?: boolean;
	u?: boolean;
	strike?: boolean;
	color?: Element;
	font?: string;
	cap?: string;
	baseline?: number;
	spc?: number;
}

/** Apply a pPr / lvlNpPr element over `base`. */
function paraProps(base: TextProps, el: Element | undefined): TextProps {
	if (!el) return base;
	const p: TextProps = { ...base };
	const a = el.attribs;
	if (a.algn) p.algn = a.algn;
	if (a.marL !== undefined) p.marL = Number(a.marL);
	if (a.indent !== undefined) p.indent = Number(a.indent);
	const spacing = (name: string): { pct?: number; pts?: number } | null => {
		const s = kid(el, name);
		if (!s) return null;
		const pct = kid(s, "a:spcPct");
		const pts = kid(s, "a:spcPts");
		return { pct: pct ? num(pct, "val") : undefined, pts: pts ? num(pts, "val") : undefined };
	};
	const ln = spacing("a:lnSpc");
	if (ln) [p.lnSpcPct, p.lnSpcPts] = [ln.pct, ln.pts];
	const bef = spacing("a:spcBef");
	if (bef) [p.spcBefPct, p.spcBefPts] = [bef.pct, bef.pts];
	const aft = spacing("a:spcAft");
	if (aft) [p.spcAftPct, p.spcAftPts] = [aft.pct, aft.pts];
	if (kid(el, "a:buNone")) p.bullet = { kind: "none" };
	const buChar = kid(el, "a:buChar");
	if (buChar)
		p.bullet = {
			kind: "char",
			char: buChar.attribs.char ?? "•",
			font: kid(el, "a:buFont")?.attribs.typeface,
		};
	const buNum = kid(el, "a:buAutoNum");
	if (buNum)
		p.bullet = {
			kind: "num",
			type: buNum.attribs.type ?? "arabicPeriod",
			start: num(buNum, "startAt", 1),
		};
	const buClr = kid(el, "a:buClr");
	if (buClr) p.buClr = colorChild(buClr);
	const buSz = kid(el, "a:buSzPct");
	if (buSz) p.buSzPct = num(buSz, "val") / 100000;
	return runProps(p, kid(el, "a:defRPr"));
}

/** Apply an rPr / defRPr / endParaRPr element over `base`. */
function runProps(base: TextProps, el: Element | undefined): TextProps {
	if (!el) return base;
	const p: TextProps = { ...base };
	const a = el.attribs;
	if (a.sz !== undefined) p.sz = Number(a.sz);
	if (a.b !== undefined) p.b = a.b === "1" || a.b === "true";
	if (a.i !== undefined) p.i = a.i === "1" || a.i === "true";
	if (a.u !== undefined) p.u = a.u !== "none";
	if (a.strike !== undefined) p.strike = a.strike !== "noStrike";
	if (a.cap !== undefined) p.cap = a.cap;
	if (a.baseline !== undefined) p.baseline = Number(a.baseline);
	if (a.spc !== undefined) p.spc = Number(a.spc);
	const fill = kid(el, "a:solidFill");
	if (fill) p.color = colorChild(fill);
	const latin = kid(el, "a:latin") ?? kid(el, "a:ea");
	const face = safeFontName(latin?.attribs.typeface);
	if (face) p.font = face;
	return p;
}

/** Wingdings / Symbol bullet glyphs → Unicode. */
const SYMBOL_BULLETS: Record<string, string> = {
	"§": "▪",
	q: "❑",
	Ø: "➢",
	ü: "✓",
	n: "■",
	l: "●",
	v: "❖",
	"·": "•",
	o: "○",
	"": "•",
};

function autoNumber(type: string, n: number): string {
	const roman = (v: number) => {
		const map: [number, string][] = [
			[1000, "m"],
			[900, "cm"],
			[500, "d"],
			[400, "cd"],
			[100, "c"],
			[90, "xc"],
			[50, "l"],
			[40, "xl"],
			[10, "x"],
			[9, "ix"],
			[5, "v"],
			[4, "iv"],
			[1, "i"],
		];
		let out = "";
		let rest = v;
		for (const [k, s] of map)
			while (rest >= k) {
				out += s;
				rest -= k;
			}
		return out;
	};
	const alpha = (v: number) => String.fromCharCode(96 + (((v - 1) % 26) + 1));
	const body = /^alphaLc/.test(type)
		? alpha(n)
		: /^alphaUc/.test(type)
			? alpha(n).toUpperCase()
			: /^romanLc/.test(type)
				? roman(n)
				: /^romanUc/.test(type)
					? roman(n).toUpperCase()
					: String(n);
	if (/ParenBoth$/.test(type)) return `(${body})`;
	if (/ParenR$/.test(type)) return `${body})`;
	if (/Plain$/.test(type)) return body;
	return `${body}.`;
}

/** @internal */
export interface Placeholder {
	type: string;
	idx?: string;
}

/** @internal */
export function placeholderOf(shape: Element): Placeholder | undefined {
	const nv = kids(shape).find((c) => /^p:nv(Sp|Pic|GraphicFrame|CxnSp|GrpSp)Pr$/.test(c.name));
	const ph = path(nv, "p:nvPr", "p:ph");
	if (!ph) return undefined;
	return { type: ph.attribs.type ?? "body", idx: ph.attribs.idx };
}

/** @internal */
export const titleTypes = new Set(["title", "ctrTitle"]);

const normType = (t: string) =>
	t === "ctrTitle" ? "title" : t === "subTitle" || t === "obj" ? "body" : t;

/** Placeholder shapes of a layout / master tree by idx and by type (first one wins), built once per tree. */
const placeholderIndex = new WeakMap<
	Element,
	{ byIdx: Map<string, Element>; byType: Map<string, Element> }
>();

/** The shape a placeholder inherits from in a layout / master tree. */
function inherited(
	tree: Element | undefined,
	ph: Placeholder,
	byTypeOnly = false,
): Element | undefined {
	if (!tree) return undefined;
	let index = placeholderIndex.get(tree);
	if (!index) {
		index = { byIdx: new Map(), byType: new Map() };
		for (const s of kids(tree)) {
			if (s.name !== "p:sp" && s.name !== "p:pic") continue;
			const p = placeholderOf(s);
			if (!p) continue;
			if (p.idx !== undefined && !index.byIdx.has(p.idx)) index.byIdx.set(p.idx, s);
			const type = normType(p.type);
			if (!index.byType.has(type)) index.byType.set(type, s);
		}
		placeholderIndex.set(tree, index);
	}
	if (!byTypeOnly && ph.idx !== undefined) {
		const byIdx = index.byIdx.get(ph.idx);
		if (byIdx) return byIdx;
	}
	return index.byType.get(normType(ph.type));
}

/** Maps EMU coordinates of a (group) child to slide EMU. */
interface Transform {
	sx: number;
	sy: number;
	tx: number;
	ty: number;
}
const IDENTITY: Transform = { sx: 1, sy: 1, tx: 0, ty: 0 };

/** @internal */
export interface Xfrm {
	x: number;
	y: number;
	w: number;
	h: number;
	rot: number;
	flipH: boolean;
	flipV: boolean;
}

/** @internal */
export function xfrmOf(el: Element | undefined): Xfrm | undefined {
	if (!el) return undefined;
	const off = kid(el, "a:off");
	const ext = kid(el, "a:ext");
	if (!off || !ext) return undefined;
	return {
		x: num(off, "x"),
		y: num(off, "y"),
		w: num(ext, "cx"),
		h: num(ext, "cy"),
		rot: num(el, "rot") / 60000,
		flipH: el.attribs.flipH === "1",
		flipV: el.attribs.flipV === "1",
	};
}

/** @internal Everything one slide's (or layout's) conversion needs. */
export interface SlideContext {
	pkg: Package;
	part: string;
	layoutPart?: string;
	masterPart?: string;
	layout?: Element;
	master?: Element;
	colors: ColorContext;
	fonts: { major?: string; minor?: string; majorEa?: string; minorEa?: string };
	masterStyles: { title?: Element; body?: Element; other?: Element };
	defaultStyle?: Element;
	/** px per EMU. */
	scale: number;
	media: (part: string) => string | null;
	slideNumber: number;
	/** Counter for ids unique within the slide (SVG markers). */
	ids: { n: number };
}

/** @internal An opened presentation: what building slide / layout contexts needs. */
export interface Presentation {
	pkg: Package;
	/** The presentation part and element (ppt/presentation.xml). */
	part: string;
	el: Element;
	/** Slide size in EMU. */
	width: number;
	height: number;
	/** px per EMU, and where the (letterboxed) slide sits on the canvas. */
	scale: number;
	offsetX: number;
	offsetY: number;
	media: (part: string) => string | null;
	/** @font-face rules for embedded fonts (only with a `media` callback). */
	fontCss: string;
	/** Slide parts, in presentation order. */
	slideParts: string[];
}

/** @internal */
export function openPresentation(data: Uint8Array, options: PptxImportOptions = {}): Presentation {
	const pkg = new Package(readZip(data));
	let presentationPart = pkg.relOf("", REL.office)?.target ?? "ppt/presentation.xml";
	// A theme file (.thmx) points at a theme manager, which points at the presentation.
	const next = pkg.relOf(presentationPart, REL.office)?.target;
	if (pkg.xml(presentationPart)?.name !== "p:presentation" && next) presentationPart = next;
	const presentation = pkg.xml(presentationPart);
	if (!presentation) throw new Error("not a PowerPoint file (no presentation part)");
	const size = kid(presentation, "p:sldSz");
	const width = num(size, "cx", 12192000);
	const height = num(size, "cy", 6858000);
	const canvas = options.canvas ?? { width: 1920, height: 1080 };
	const scale = Math.min(canvas.width / width, canvas.height / height);

	const mediaUrls = new Map<string, string | null>();
	const media = (part: string): string | null => {
		if (mediaUrls.has(part)) return mediaUrls.get(part) ?? null;
		const bytes = pkg.files.get(part);
		const ext = posix.extname(part).slice(1).toLowerCase();
		const type = MIME[ext];
		let url: string | null = null;
		if (bytes && type) {
			url = options.media
				? options.media({ name: posix.basename(part), data: bytes, type })
				: `data:${type};base64,${bytes.toString("base64")}`;
		}
		mediaUrls.set(part, url);
		return url;
	};

	const rels = pkg.rels(presentationPart);
	// Fonts embedded in the file (PowerPoint "Embed fonts"): @font-face rules, when they can be served.
	let fontCss = "";
	if (options.media) {
		for (const ef of kids(kid(presentation, "p:embeddedFontLst"), "p:embeddedFont")) {
			const family = safeFontName(kid(ef, "p:font")?.attribs.typeface);
			if (!family) continue;
			for (const [slot, weight, style] of [
				["regular", 400, "normal"],
				["bold", 700, "normal"],
				["italic", 400, "italic"],
				["boldItalic", 700, "italic"],
			] as const) {
				const id = kid(ef, `p:${slot}`)?.attribs["r:id"];
				const target = id ? rels.get(id)?.target : undefined;
				const font = target ? fontFromEot(pkg.files.get(target)) : null;
				if (!font) continue;
				const url = options.media({ name: `${family}-${slot}.ttf`, data: font, type: "font/ttf" });
				fontCss += `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};src:url('${url.replace(/'/g, "%27")}')}`;
			}
		}
	}
	return {
		pkg,
		part: presentationPart,
		el: presentation,
		width,
		height,
		scale,
		offsetX: (canvas.width - width * scale) / 2,
		offsetY: (canvas.height - height * scale) / 2,
		media,
		fontCss,
		// Each slide part once (a crafted file can list one many times), and at most MAX_SLIDES.
		slideParts: [
			...new Set(
				kids(kid(presentation, "p:sldIdLst"), "p:sldId")
					.map((s) => rels.get(s.attribs["r:id"] ?? "")?.target)
					.filter((p): p is string => !!p),
			),
		].slice(0, MAX_SLIDES),
	};
}

/**
 * @internal The context for converting a slide, or a layout (`part` is then
 * the layout itself): its layout, master, theme colors / fonts and text styles.
 */
export function contextFor(p: Presentation, part: string, slideNumber = 0): SlideContext {
	const { pkg } = p;
	const own = pkg.xml(part);
	const isLayout = own?.name === "p:sldLayout";
	const layoutPart = isLayout ? part : pkg.relOf(part, REL.layout)?.target;
	const layout = pkg.xml(layoutPart);
	const masterPart = layoutPart ? pkg.relOf(layoutPart, REL.master)?.target : undefined;
	const master = pkg.xml(masterPart);
	const themePart = masterPart ? pkg.relOf(masterPart, REL.theme)?.target : undefined;
	const theme = pkg.xml(themePart);
	const fontScheme = path(theme, "a:themeElements", "a:fontScheme");
	// Color map: the master's, overridden by the layout's / slide's.
	let map: ColorMap = { ...DEFAULT_COLOR_MAP, ...(kid(master, "p:clrMap")?.attribs ?? {}) };
	for (const src of isLayout ? [layout] : [layout, own]) {
		const over = path(src, "p:clrMapOvr", "a:overrideClrMapping");
		if (over) map = { ...map, ...over.attribs };
	}
	const txStyles = kid(master, "p:txStyles");
	return {
		pkg,
		part,
		layoutPart,
		masterPart,
		layout,
		master,
		colors: { theme: themeColors(theme), map },
		fonts: {
			major: safeFontName(path(fontScheme, "a:majorFont", "a:latin")?.attribs.typeface),
			minor: safeFontName(path(fontScheme, "a:minorFont", "a:latin")?.attribs.typeface),
			majorEa: safeFontName(path(fontScheme, "a:majorFont", "a:ea")?.attribs.typeface),
			minorEa: safeFontName(path(fontScheme, "a:minorFont", "a:ea")?.attribs.typeface),
		},
		masterStyles: {
			title: kid(txStyles, "p:titleStyle"),
			body: kid(txStyles, "p:bodyStyle"),
			other: kid(txStyles, "p:otherStyle"),
		},
		defaultStyle: kid(p.el, "p:defaultTextStyle"),
		scale: p.scale,
		media: p.media,
		slideNumber,
		ids: { n: 0 },
	};
}

/** @internal A slide's (or layout's) shape tree. */
export const spTree = (el: Element | undefined) => path(el, "p:cSld", "p:spTree");
const showMaster = (el: Element | undefined) => el?.attribs.showMasterSp !== "0";

/**
 * @internal Master and layout artwork (not their placeholders, which only
 * prompt) — what's under a slide's own shapes. `ctx` is a slide's or a layout's.
 */
export function artwork(ctx: SlideContext, slide?: Element): string {
	const parts: string[] = [];
	if (showMaster(slide) && showMaster(ctx.layout) && ctx.masterPart)
		parts.push(renderTree(spTree(ctx.master), IDENTITY, { ...ctx, part: ctx.masterPart }, false));
	if (showMaster(slide) && ctx.layoutPart)
		parts.push(renderTree(spTree(ctx.layout), IDENTITY, { ...ctx, part: ctx.layoutPart }, false));
	return parts.join("");
}

/** @internal The canvas div's opening tag: letterboxed position, background, default font / color. */
export function canvasOpen(p: Presentation, ctx: SlideContext, slide?: Element): string {
	const background = backgroundCss(
		[
			[slide, ctx.part],
			[ctx.layout, ctx.layoutPart],
			[ctx.master, ctx.masterPart],
		],
		ctx,
	);
	return `<div class="astlide-pptx-canvas" style="left:${r2(p.offsetX)}px;top:${r2(p.offsetY)}px;width:${r2(p.width * p.scale)}px;height:${r2(p.height * p.scale)}px;${background}${ctx.fonts.minor ? `font-family:${fontStack(ctx.fonts.minor)};` : ""}color:${cssColor(schemeEl("tx1"), ctx.colors) ?? "#000"}">`;
}

export function pptxToSlides(data: Uint8Array, options: PptxImportOptions = {}): ImportedDeck {
	const p = openPresentation(data, options);
	const { pkg } = p;

	let deckTheme: ImportedDeck["theme"] = { colors: {}, fonts: {} };
	const slides = p.slideParts.map((part, i) => {
		const slide = pkg.xml(part);
		if (!slide) throw new Error(`missing slide part ${part}`);
		const ctx = contextFor(p, part, i + 1);
		if (i === 0)
			deckTheme = {
				colors: ctx.colors.theme,
				fonts: { heading: ctx.fonts.major, body: ctx.fonts.minor },
			};
		const titleShape = kids(spTree(slide)).find((s) =>
			titleTypes.has(placeholderOf(s)?.type ?? ""),
		);
		const html =
			`${STYLE}${p.fontCss ? `<style>${p.fontCss}</style>` : ""}<div class="astlide-pptx">${canvasOpen(p, ctx, slide)}` +
			`${artwork(ctx, slide)}${renderTree(spTree(slide), IDENTITY, ctx, true)}\n</div></div>`;
		return {
			index: i + 1,
			html,
			notes: notesOf(pkg, part),
			title: titleShape
				? paragraphsText(kid(titleShape, "p:txBody")).trim() || undefined
				: undefined,
			hidden: slide.attribs.show === "0",
		};
	});

	const core = pkg.xml("docProps/core.xml");
	return {
		width: p.width,
		height: p.height,
		slides,
		title: textOf(kid(core, "dc:title")).trim() || undefined,
		author: textOf(kid(core, "dc:creator")).trim() || undefined,
		theme: deckTheme,
	};
}

/** @internal Resets the slide's theme CSS would otherwise apply to the imported markup. */
export const STYLE =
	"<style>.astlide-pptx{position:absolute;inset:0;overflow:hidden}" +
	".astlide-pptx-canvas{position:absolute;overflow:hidden;line-height:1.2}" +
	".astlide-pptx *{box-sizing:border-box}" +
	// PowerPoint keeps runs of spaces (code indentation …): pre-wrap does too.
	".astlide-pptx p{margin:0;padding:0;font-size:inherit;color:inherit;max-width:none;white-space:pre-wrap}" +
	".astlide-pptx table{border-collapse:collapse;table-layout:fixed;margin:0;width:auto}" +
	".astlide-pptx td{padding:0;border:none;background:none;vertical-align:top;text-align:left;font-weight:inherit}" +
	".astlide-pptx a{color:inherit}" +
	".astlide-pptx img{max-width:none}</style>\n";

/** @internal */
export function schemeEl(name: string): Element {
	return parseXml(`<a:schemeClr val="${name}"/>`);
}

function themeColors(theme: Element | undefined): ThemeColors {
	const scheme = path(theme, "a:themeElements", "a:clrScheme");
	const out: ThemeColors = {};
	for (const c of kids(scheme)) {
		const name = c.name.replace(/^a:/, "");
		const v = kids(c)[0];
		if (!v) continue;
		const hex = v.name === "a:sysClr" ? v.attribs.lastClr : v.attribs.val;
		// Only real colors: the values end up in CSS.
		if (hex && /^[0-9a-f]{6}$/i.test(hex)) out[name] = hex.toLowerCase();
	}
	return out;
}

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

/** CSS `background` for a fill element (spPr / bgPr), or "" for none. */
function fillCss(spPr: Element | undefined, ctx: SlideContext, part: string): string | null {
	if (!spPr) return null;
	if (kid(spPr, "a:noFill")) return "";
	const solid = kid(spPr, "a:solidFill");
	if (solid) return cssColor(colorChild(solid), ctx.colors) ?? "";
	const grad = kid(spPr, "a:gradFill");
	if (grad) {
		const stops = kids(kid(grad, "a:gsLst"), "a:gs")
			.map((gs) => ({ pos: num(gs, "pos") / 1000, color: cssColor(colorChild(gs), ctx.colors) }))
			.filter((s) => s.color)
			.sort((a, b) => a.pos - b.pos)
			.map((s) => `${s.color} ${r2(s.pos)}%`)
			.join(", ");
		if (!stops) return "";
		if (kid(grad, "a:path")) return `radial-gradient(circle, ${stops})`;
		const ang = num(kid(grad, "a:lin"), "ang") / 60000;
		return `linear-gradient(${r2(ang + 90)}deg, ${stops})`;
	}
	const patt = kid(spPr, "a:pattFill");
	if (patt) return patternCss(patt, ctx);
	const blip = kid(spPr, "a:blipFill");
	if (blip) {
		const url = imageUrl(blip, ctx, part);
		if (!url) return "";
		const css = `url('${url.replace(/'/g, "%27")}')`;
		// Tiled: the picture at its own size (96 dpi, scaled by sx / sy), repeated.
		const tile = kid(blip, "a:tile");
		const size = tile ? imageSize(blip, ctx, part) : null;
		if (tile && size) {
			const w = size.w * 9525 * ctx.scale * (num(tile, "sx", 100000) / 100000);
			const h = size.h * 9525 * ctx.scale * (num(tile, "sy", 100000) / 100000);
			return `${css} 0 0 / ${r2(w)}px ${r2(h)}px repeat`;
		}
		return `${css} center / 100% 100% no-repeat`;
	}
	return null;
}

/**
 * A pattern fill: line patterns (horizontal / vertical / diagonal, grids) as
 * repeating gradients over the background color; dotted and percentage
 * patterns as the colors mixed by coverage.
 */
function patternCss(patt: Element, ctx: SlideContext): string {
	const fg = colorOf(colorChild(kid(patt, "a:fgClr")), ctx.colors) ?? { hex: "000000", alpha: 1 };
	const bg = colorOf(colorChild(kid(patt, "a:bgClr")), ctx.colors) ?? { hex: "ffffff", alpha: 1 };
	const prst = patt.attribs.prst ?? "pct50";
	const css = (c: { hex: string; alpha: number }) =>
		`#${c.hex}${
			c.alpha < 1
				? Math.round(c.alpha * 255)
						.toString(16)
						.padStart(2, "0")
				: ""
		}`;
	const lines = (deg: number, gap: number) =>
		`repeating-linear-gradient(${deg}deg, ${css(fg)} 0 1px, transparent 1px ${gap}px)`;
	const big = /^(lg|wd|dk)/.test(prst) ? 8 : 4;
	const layers: string[] = [];
	if (/horz|grid|cross/i.test(prst) && !/diag/i.test(prst)) layers.push(lines(0, big));
	if (/vert|grid|cross/i.test(prst) && !/diag/i.test(prst)) layers.push(lines(90, big));
	if (/dndiag|diagcross/i.test(prst)) layers.push(lines(45, big));
	if (/updiag|diagcross/i.test(prst)) layers.push(lines(-45, big));
	if (layers.length) return `${layers.join(", ")}, ${css(bg)}`;
	// Dots / percentages: the average color.
	const pct = Number(prst.match(/pct(\d+)/)?.[1] ?? 50) / 100;
	const mix = [0, 2, 4]
		.map((i) => {
			const a = Number.parseInt(fg.hex.slice(i, i + 2), 16);
			const b = Number.parseInt(bg.hex.slice(i, i + 2), 16);
			return Math.round(a * pct + b * (1 - pct))
				.toString(16)
				.padStart(2, "0");
		})
		.join("");
	return `#${mix}`;
}

/** Pixel size of a fill's picture (PNG, JPEG, GIF), or null. */
function imageSize(
	blipFill: Element,
	ctx: SlideContext,
	part: string,
): { w: number; h: number } | null {
	const id = kid(blipFill, "a:blip")?.attribs["r:embed"];
	const rel = id ? ctx.pkg.rels(part).get(id) : undefined;
	const b = rel && !rel.external ? ctx.pkg.files.get(rel.target) : undefined;
	if (!b || b.length < 24) return null;
	if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
	if (b.toString("latin1", 0, 3) === "GIF") return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
	if (b[0] === 0xff && b[1] === 0xd8) {
		for (let i = 2; i + 9 < b.length; ) {
			if (b[i] !== 0xff) return null;
			const marker = b[i + 1] ?? 0;
			if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
				return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
			i += 2 + b.readUInt16BE(i + 2);
		}
	}
	return null;
}

function imageUrl(blipFill: Element, ctx: SlideContext, part: string): string | null {
	const id = kid(blipFill, "a:blip")?.attribs["r:embed"];
	const rel = id ? ctx.pkg.rels(part).get(id) : undefined;
	return rel && !rel.external ? ctx.media(rel.target) : null;
}

function backgroundCss(
	chain: [Element | undefined, string | undefined][],
	ctx: SlideContext,
): string {
	for (const [el, part] of chain) {
		const bg = path(el, "p:cSld", "p:bg");
		if (!bg) continue;
		const bgPr = kid(bg, "p:bgPr");
		if (bgPr) {
			// A picture background's relationship is in the part that defines it.
			const css = fillCss(bgPr, ctx, part ?? ctx.part);
			if (css) return `background:${css};`;
		}
		const ref = kid(bg, "p:bgRef");
		if (ref) {
			const c = cssColor(colorChild(ref), ctx.colors);
			if (c) return `background:${c};`;
		}
	}
	return `background:${cssColor(schemeEl("bg1"), ctx.colors) ?? "#fff"};`;
}

/** One shape per line, so imported slides read (and edit) shape by shape. */
const line = (html: string) => (html ? `\n${html}` : "");

/** Shapes of a tree as HTML. `placeholders`: render placeholder shapes too (the slide's own). */
function renderTree(
	tree: Element | undefined,
	t: Transform,
	ctx: SlideContext,
	placeholders: boolean,
): string {
	let out = "";
	for (const raw of kids(tree)) {
		// Alternate content: the fallback is what other apps understand.
		const shapes =
			raw.name === "mc:AlternateContent"
				? kids(kid(raw, "mc:Fallback") ?? kids(raw, "mc:Choice")[0])
				: [raw];
		for (const s of shapes) {
			const ph = placeholderOf(s);
			if (ph && !placeholders) continue;
			switch (s.name) {
				case "p:sp":
				case "p:cxnSp":
					out += line(renderShape(s, t, ctx, ph));
					break;
				case "p:pic":
					out += line(renderPicture(s, t, ctx, ph));
					break;
				case "p:grpSp":
					out += renderGroup(s, t, ctx, placeholders);
					break;
				case "p:graphicFrame":
					out += line(renderFrame(s, t, ctx));
					break;
			}
		}
	}
	return out;
}

function renderGroup(g: Element, t: Transform, ctx: SlideContext, placeholders: boolean): string {
	const x = path(g, "p:grpSpPr", "a:xfrm");
	const xf = xfrmOf(x);
	const chOff = kid(x, "a:chOff");
	const chExt = kid(x, "a:chExt");
	if (!xf || !chOff || !chExt) return renderTree(g, t, ctx, placeholders);
	const sx = num(chExt, "cx") ? xf.w / num(chExt, "cx") : 1;
	const sy = num(chExt, "cy") ? xf.h / num(chExt, "cy") : 1;
	const inner: Transform = {
		sx: t.sx * sx,
		sy: t.sy * sy,
		tx: t.tx + t.sx * (xf.x - num(chOff, "x") * sx),
		ty: t.ty + t.sy * (xf.y - num(chOff, "y") * sy),
	};
	return renderTree(g, inner, ctx, placeholders);
}

/** Box style (position, size, rotation / flips) in px. */
function boxCss(xf: Xfrm, t: Transform, ctx: SlideContext): string {
	const s = ctx.scale;
	const tr: string[] = [];
	if (xf.rot) tr.push(`rotate(${r2(xf.rot)}deg)`);
	if (xf.flipH) tr.push("scaleX(-1)");
	if (xf.flipV) tr.push("scaleY(-1)");
	return (
		`position:absolute;left:${r2((t.tx + xf.x * t.sx) * s)}px;top:${r2((t.ty + xf.y * t.sy) * s)}px;` +
		`width:${r2(xf.w * t.sx * s)}px;height:${r2(xf.h * t.sy * s)}px;${tr.length ? `transform:${tr.join(" ")};` : ""}`
	);
}

/** @internal The placeholder chain of a shape: [master shape, layout shape] it inherits from. */
export function sources(ph: Placeholder | undefined, ctx: SlideContext): Element[] {
	if (!ph) return [];
	const tree = (el: Element | undefined) => path(el, "p:cSld", "p:spTree");
	const layoutShape = inherited(tree(ctx.layout), ph);
	const masterShape = inherited(
		tree(ctx.master),
		layoutShape ? (placeholderOf(layoutShape) ?? ph) : ph,
		true,
	);
	return [masterShape, layoutShape].filter((e): e is Element => !!e);
}

function lineCss(ln: Element | undefined, ctx: SlideContext, styleColor?: Element): Line | null {
	if (ln && kid(ln, "a:noFill")) return null;
	const fill = kid(ln, "a:solidFill");
	const color = fill
		? cssColor(colorChild(fill), ctx.colors)
		: styleColor
			? cssColor(styleColor, ctx.colors)
			: null;
	if (!color) return null;
	const width = Math.max(0.5, num(ln, "w", 12700) * ctx.scale);
	// Dashes as an SVG dash array: preset patterns (in line widths) or custom ones.
	let pattern: number[] | undefined;
	const custom = kids(kid(ln, "a:custDash"), "a:ds");
	if (custom.length)
		pattern = custom.flatMap((ds) => [num(ds, "d") / 100000, num(ds, "sp") / 100000]);
	else pattern = DASHES[kid(ln, "a:prstDash")?.attribs.val ?? "solid"];
	const dash = pattern?.length ? pattern.map((v) => r2(Math.max(0.5, v * width))).join(" ") : null;
	return { width, color, dash };
}

interface Line {
	width: number;
	color: string;
	/** SVG stroke-dasharray, or null for a solid line. */
	dash: string | null;
}

/** Preset dashes, in multiples of the line width. */
const DASHES: Record<string, number[]> = {
	dash: [4, 3],
	sysDash: [3, 1],
	lgDash: [8, 3],
	dot: [1, 3],
	sysDot: [1, 1],
	dashDot: [4, 3, 1, 3],
	sysDashDot: [3, 1, 1, 1],
	lgDashDot: [8, 3, 1, 3],
	lgDashDotDot: [8, 3, 1, 3, 1, 3],
	sysDashDotDot: [3, 1, 1, 1, 1, 1],
};

function renderShape(
	sp: Element,
	t: Transform,
	ctx: SlideContext,
	ph: Placeholder | undefined,
): string {
	const chain = sources(ph, ctx);
	const spPr = kid(sp, "p:spPr");
	const xf =
		xfrmOf(kid(spPr, "a:xfrm")) ??
		chain
			.map((c) => xfrmOf(path(c, "p:spPr", "a:xfrm")))
			.filter(Boolean)
			.pop();
	if (!xf) return "";
	const style = kid(sp, "p:style");
	// Fill: the shape's own, else its style's fillRef color.
	let fill = fillCss(spPr, ctx, ctx.part);
	if (fill === null) {
		const ref = kid(style, "a:fillRef");
		fill = ref && num(ref, "idx") > 0 ? (cssColor(colorChild(ref), ctx.colors) ?? "") : "";
	}
	const lnRef = kid(style, "a:lnRef");
	const line = lineCss(
		kid(spPr, "a:ln"),
		ctx,
		lnRef && num(lnRef, "idx") > 0 ? colorChild(lnRef) : undefined,
	);
	const geom =
		kid(spPr, "a:prstGeom")?.attribs.prst ?? (kid(spPr, "a:custGeom") ? "custom" : "rect");
	const ln = kid(spPr, "a:ln");
	const head = kid(ln, "a:headEnd")?.attribs.type;
	const tail = kid(ln, "a:tailEnd")?.attribs.type;

	let drawing = "";
	const px = (n: number) => r2(n);
	const w = xf.w * t.sx * ctx.scale;
	const h = xf.h * t.sy * ctx.scale;
	if (geom === "rect" || geom === "roundRect" || geom === "ellipse") {
		const radius =
			geom === "ellipse"
				? "50%"
				: geom === "roundRect"
					? `${px(Math.min(w, h) * adj(spPr, 16667))}px`
					: "";
		const border = line
			? `border:${px(line.width)}px ${line.dash ? "dashed" : "solid"} ${line.color};`
			: "";
		if (fill || border)
			drawing = `<div style="position:absolute;inset:0;${fill ? `background:${fill};` : ""}${border}${radius ? `border-radius:${radius};` : ""}"></div>`;
	} else {
		const svg = svgGeometry(geom, spPr, w, h, fill ?? "", line, `m${++ctx.ids.n}`, head, tail);
		if (svg) drawing = svg;
	}
	const text = renderText(kid(sp, "p:txBody"), chain, ph, ctx);
	if (!drawing && !text) return "";
	return `<div style="${boxCss(xf, t, ctx)}">${drawing}${text}</div>`;
}

/** An adjust value of a preset geometry, as a fraction (adj 16667 → 0.16667). */
function adj(spPr: Element | undefined, fallback: number): number {
	const gd = find(path(spPr, "a:prstGeom"), "a:gd");
	const m = gd?.attribs.fmla?.match(/val (-?\d+)/);
	return (m ? Number(m[1]) : fallback) / 100000;
}

/** Preset / custom geometries other than rect / roundRect / ellipse, as SVG. */
function svgGeometry(
	geom: string,
	spPr: Element | undefined,
	w: number,
	h: number,
	fill: string,
	line: Line | null,
	uid: string,
	head?: string,
	tail?: string,
): string | null {
	const p = (pts: [number, number][]) =>
		`M${pts.map(([x, y]) => `${r2(x * w)} ${r2(y * h)}`).join(" L")} Z`;
	let d: string | null = null;
	let open = false;
	switch (geom) {
		case "line":
		case "straightConnector1":
		case "bentConnector2":
		case "bentConnector3":
		case "curvedConnector3":
			d = `M0 0 L${r2(w)} ${r2(h)}`;
			open = true;
			break;
		case "triangle":
			d = p([
				[0.5, 0],
				[1, 1],
				[0, 1],
			]);
			break;
		case "rtTriangle":
			d = p([
				[0, 0],
				[1, 1],
				[0, 1],
			]);
			break;
		case "diamond":
			d = p([
				[0.5, 0],
				[1, 0.5],
				[0.5, 1],
				[0, 0.5],
			]);
			break;
		case "parallelogram":
			d = p([
				[0.25, 0],
				[1, 0],
				[0.75, 1],
				[0, 1],
			]);
			break;
		case "trapezoid":
			d = p([
				[0.25, 0],
				[0.75, 0],
				[1, 1],
				[0, 1],
			]);
			break;
		case "pentagon":
		case "homePlate":
			d = p([
				[0, 0],
				[0.8, 0],
				[1, 0.5],
				[0.8, 1],
				[0, 1],
			]);
			break;
		case "chevron":
			d = p([
				[0, 0],
				[0.8, 0],
				[1, 0.5],
				[0.8, 1],
				[0, 1],
				[0.2, 0.5],
			]);
			break;
		case "hexagon":
			d = p([
				[0.25, 0],
				[0.75, 0],
				[1, 0.5],
				[0.75, 1],
				[0.25, 1],
				[0, 0.5],
			]);
			break;
		case "octagon":
			d = p([
				[0.29, 0],
				[0.71, 0],
				[1, 0.29],
				[1, 0.71],
				[0.71, 1],
				[0.29, 1],
				[0, 0.71],
				[0, 0.29],
			]);
			break;
		case "rightArrow":
			d = p([
				[0, 0.25],
				[0.7, 0.25],
				[0.7, 0],
				[1, 0.5],
				[0.7, 1],
				[0.7, 0.75],
				[0, 0.75],
			]);
			break;
		case "leftArrow":
			d = p([
				[1, 0.25],
				[0.3, 0.25],
				[0.3, 0],
				[0, 0.5],
				[0.3, 1],
				[0.3, 0.75],
				[1, 0.75],
			]);
			break;
		case "upArrow":
			d = p([
				[0.25, 1],
				[0.25, 0.3],
				[0, 0.3],
				[0.5, 0],
				[1, 0.3],
				[0.75, 0.3],
				[0.75, 1],
			]);
			break;
		case "downArrow":
			d = p([
				[0.25, 0],
				[0.25, 0.7],
				[0, 0.7],
				[0.5, 1],
				[1, 0.7],
				[0.75, 0.7],
				[0.75, 0],
			]);
			break;
		case "star5": {
			const pts: [number, number][] = [];
			for (let i = 0; i < 10; i++) {
				const r = i % 2 ? 0.19 : 0.5;
				const a = -Math.PI / 2 + (i * Math.PI) / 5;
				pts.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]);
			}
			d = p(pts);
			break;
		}
		case "wedgeRectCallout":
		case "wedgeRoundRectCallout":
		case "wedgeEllipseCallout":
			d = calloutPath(spPr, w, h);
			break;
		case "custom":
			d = customPath(kid(spPr, "a:custGeom"), w, h);
			break;
		default:
			// Unknown presets draw as their box.
			d = p([
				[0, 0],
				[1, 0],
				[1, 1],
				[0, 1],
			]);
	}
	if (!d) return null;
	const markers: string[] = [];
	const marker = (id: string, flip: boolean) =>
		`<marker id="${id}" viewBox="0 0 10 10" refX="${flip ? 1 : 9}" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${line?.color ?? "#000"}"/></marker>`;
	if (head && head !== "none") markers.push(marker(`${uid}h`, true));
	if (tail && tail !== "none") markers.push(marker(`${uid}t`, false));
	const stroke = line
		? `stroke="${line.color}" stroke-width="${r2(line.width)}"${line.dash ? ` stroke-dasharray="${line.dash}"` : ""}`
		: 'stroke="none"';
	const ends = `${head && head !== "none" ? ` marker-start="url(#${uid}h)"` : ""}${tail && tail !== "none" ? ` marker-end="url(#${uid}t)"` : ""}`;
	// Pictures and gradients can't be SVG paints here: a box cut to the shape takes them.
	const css = !!fill && !open && /gradient|url\(/.test(fill);
	const paint = fill && !open && !css ? fill : "none";
	return (
		(css
			? `<div style="position:absolute;inset:0;background:${fill};clip-path:path('${d}')"></div>`
			: "") +
		`<svg style="position:absolute;left:0;top:0;overflow:visible" width="${r2(Math.max(w, 1))}" height="${r2(Math.max(h, 1))}">` +
		`${markers.length ? `<defs>${markers.join("")}</defs>` : ""}<path d="${d}" fill="${paint}" ${stroke}${ends}/></svg>`
	);
}

/** A named adjust value of a preset geometry (fraction), or `fallback`. */
function adjNamed(spPr: Element | undefined, name: string, fallback: number): number {
	const gd = kids(kid(kid(spPr, "a:prstGeom"), "a:avLst"), "a:gd").find(
		(g) => g.attribs.name === name,
	);
	const m = gd?.attribs.fmla?.match(/val (-?\d+)/);
	return (m ? Number(m[1]) : fallback) / 100000;
}

/**
 * Speech-bubble callouts: a rectangle with a wedge to the tip at
 * (adj1, adj2) from the center, its base on the side the tip lies past.
 */
function calloutPath(spPr: Element | undefined, w: number, h: number): string {
	const tx = (0.5 + adjNamed(spPr, "adj1", -20833)) * w;
	const ty = (0.5 + adjNamed(spPr, "adj2", 62500)) * h;
	const pt = (x: number, y: number) => `${r2(x)} ${r2(y)}`;
	const dx = (tx - w / 2) / w;
	const dy = (ty - h / 2) / h;
	const near = (v: number) => (v < 0.5 ? [1 / 6, 5 / 12] : [7 / 12, 5 / 6]);
	const tip = pt(tx, ty);
	if (Math.abs(dy) >= Math.abs(dx) && dy > 0.5) {
		const [a, b] = near(tx / w).map((f) => f * w);
		return `M${pt(0, 0)} L${pt(w, 0)} L${pt(w, h)} L${pt(b ?? 0, h)} L${tip} L${pt(a ?? 0, h)} L${pt(0, h)} Z`;
	}
	if (Math.abs(dy) >= Math.abs(dx) && dy < -0.5) {
		const [a, b] = near(tx / w).map((f) => f * w);
		return `M${pt(0, 0)} L${pt(a ?? 0, 0)} L${tip} L${pt(b ?? 0, 0)} L${pt(w, 0)} L${pt(w, h)} L${pt(0, h)} Z`;
	}
	if (dx > 0.5) {
		const [a, b] = near(ty / h).map((f) => f * h);
		return `M${pt(0, 0)} L${pt(w, 0)} L${pt(w, a ?? 0)} L${tip} L${pt(w, b ?? 0)} L${pt(w, h)} L${pt(0, h)} Z`;
	}
	if (dx < -0.5) {
		const [a, b] = near(ty / h).map((f) => f * h);
		return `M${pt(0, 0)} L${pt(w, 0)} L${pt(w, h)} L${pt(0, h)} L${pt(0, b ?? 0)} L${tip} L${pt(0, a ?? 0)} Z`;
	}
	// Tip inside the box: just the box.
	return `M${pt(0, 0)} L${pt(w, 0)} L${pt(w, h)} L${pt(0, h)} Z`;
}

function customPath(geom: Element | undefined, w: number, h: number): string | null {
	const out: string[] = [];
	for (const path of kids(kid(geom, "a:pathLst"), "a:path")) {
		const pw = num(path, "w", 1) || 1;
		const ph = num(path, "h", 1) || 1;
		const pt = (el: Element | undefined): [number, number] => [
			(num(el, "x") / pw) * w,
			(num(el, "y") / ph) * h,
		];
		let cur: [number, number] = [0, 0];
		for (const c of kids(path)) {
			const pts = kids(c, "a:pt").map(pt);
			switch (c.name) {
				case "a:moveTo":
					cur = pts[0] ?? cur;
					out.push(`M${r2(cur[0])} ${r2(cur[1])}`);
					break;
				case "a:lnTo":
					cur = pts[0] ?? cur;
					out.push(`L${r2(cur[0])} ${r2(cur[1])}`);
					break;
				case "a:cubicBezTo":
					out.push(`C${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" ")}`);
					cur = pts[2] ?? cur;
					break;
				case "a:quadBezTo":
					out.push(`Q${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" ")}`);
					cur = pts[1] ?? cur;
					break;
				case "a:arcTo": {
					const wR = (num(c, "wR") / pw) * w;
					const hR = (num(c, "hR") / ph) * h;
					const st = (num(c, "stAng") / 60000) * (Math.PI / 180);
					const sw = (num(c, "swAng") / 60000) * (Math.PI / 180);
					const cx = cur[0] - wR * Math.cos(st);
					const cy = cur[1] - hR * Math.sin(st);
					const end: [number, number] = [cx + wR * Math.cos(st + sw), cy + hR * Math.sin(st + sw)];
					out.push(
						`A${r2(wR)} ${r2(hR)} 0 ${Math.abs(sw) > Math.PI ? 1 : 0} ${sw > 0 ? 1 : 0} ${r2(end[0])} ${r2(end[1])}`,
					);
					cur = end;
					break;
				}
				case "a:close":
					out.push("Z");
					break;
			}
		}
	}
	return out.length ? out.join(" ") : null;
}

/** Text of paragraphs (for titles / notes). */
function paragraphsText(txBody: Element | undefined): string {
	return kids(txBody, "a:p")
		.map((p) =>
			kids(p)
				.map((r) =>
					r.name === "a:br"
						? "\n"
						: r.name === "a:r" || r.name === "a:fld"
							? textOf(kid(r, "a:t"))
							: "",
				)
				.join(""),
		)
		.join("\n");
}

function notesOf(pkg: Package, slidePart: string): string {
	const part = pkg.relOf(slidePart, REL.notes)?.target;
	const notes = pkg.xml(part);
	const body = kids(path(notes, "p:cSld", "p:spTree"), "p:sp").find(
		(s) => placeholderOf(s)?.type === "body",
	);
	// Paragraphs separated by a blank line (Markdown paragraphs in the notes view).
	return paragraphsText(kid(body, "p:txBody"))
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.join("\n\n");
}

/**
 * The TrueType / OpenType file inside an embedded font (EOT, as PowerPoint
 * stores them in ppt/fonts/*.fntdata): uncompressed EOTs, XOR-obfuscated or
 * not. MicroType-compressed ones (and anything else) give null.
 */
export function fontFromEot(eot: Buffer | undefined): Buffer | null {
	if (!eot || eot.length < 82) return null;
	const dataSize = eot.readUInt32LE(4);
	const flags = eot.readUInt32LE(12);
	if (flags & 0x4 || dataSize <= 0 || dataSize > eot.length) return null; // MTX compressed
	const font = Buffer.from(eot.subarray(eot.length - dataSize));
	if (flags & 0x10000000) for (let i = 0; i < font.length; i++) font[i] = (font[i] ?? 0) ^ 0x50;
	const magic = font.readUInt32BE(0);
	return magic === 0x00010000 || magic === 0x4f54544f || magic === 0x74727565 ? font : null;
}

/** @internal Level styles for a shape's text: master text style → master / layout placeholder → shape. */
export function levelStyle(
	level: number,
	chain: Element[],
	ph: Placeholder | undefined,
	ctx: SlideContext,
	own: Element | undefined,
): TextProps {
	const lvl = `a:lvl${level + 1}pPr`;
	let props: TextProps = {};
	props = paraProps(props, kid(ctx.defaultStyle, lvl));
	// Titles use the master's title style, content placeholders its body style; text
	// boxes and the date / footer / slide-number placeholders its "other" style.
	const master =
		!ph || /^(dt|ftr|sldNum|hdr)$/.test(ph.type)
			? ctx.masterStyles.other
			: titleTypes.has(ph.type)
				? ctx.masterStyles.title
				: ctx.masterStyles.body;
	props = paraProps(props, kid(master, lvl));
	for (const c of chain) props = paraProps(props, kid(path(c, "p:txBody", "a:lstStyle"), lvl));
	props = paraProps(props, kid(kid(own, "a:lstStyle"), lvl));
	return props;
}

function renderText(
	txBody: Element | undefined,
	chain: Element[],
	ph: Placeholder | undefined,
	ctx: SlideContext,
): string {
	const t = textBody(txBody, chain, ph, ctx);
	if (!t) return "";
	return `<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:${t.anchor};padding:${t.padding};">${t.wrap ? t.html : t.html.replace(/<p style="/g, '<p style="white-space:pre;')}</div>`;
}

/** A text body's paragraphs as HTML, with its insets / anchoring / wrapping. */
function textBody(
	txBody: Element | undefined,
	chain: Element[],
	ph: Placeholder | undefined,
	ctx: SlideContext,
): { html: string; padding: string; anchor: string; wrap: boolean } | null {
	if (!txBody) return null;
	const paras = kids(txBody, "a:p");
	if (
		!paras.some((p) =>
			kids(p).some((r) => r.name === "a:r" || r.name === "a:fld" || r.name === "a:br"),
		)
	)
		return null;
	// Body properties: master → layout → shape.
	const bodyPrs = [...chain.map((c) => path(c, "p:txBody", "a:bodyPr")), kid(txBody, "a:bodyPr")];
	const body: Record<string, string> = {};
	let fontScale = 1;
	let spacingCut = 0;
	for (const b of bodyPrs) {
		if (!b) continue;
		Object.assign(body, b.attribs);
		const auto = kid(b, "a:normAutofit");
		if (auto) {
			fontScale = num(auto, "fontScale", 100000) / 100000;
			spacingCut = num(auto, "lnSpcReduction") / 100000;
		}
	}
	const s = ctx.scale;
	const ins = (k: string, d: number) => r2(Number(body[k] ?? d) * s);
	const anchor = body.anchor === "ctr" ? "center" : body.anchor === "b" ? "flex-end" : "flex-start";
	const wrap = body.wrap !== "none";
	const counters = new Map<number, number>();
	const ptPx = 12700 * s; // px per point

	let html = "";
	for (const p of paras) {
		// Some generators write a second pPr mid-paragraph; the last one wins (as in LibreOffice).
		const pPr = kids(p, "a:pPr").pop();
		const level = num(pPr, "lvl");
		let props = levelStyle(level, chain, ph, ctx, txBody);
		props = paraProps(props, pPr);
		const runs = kids(p).filter((r) => r.name === "a:r" || r.name === "a:fld" || r.name === "a:br");
		const firstRun = runProps(
			props,
			kid(
				runs.find((r) => r.name !== "a:br"),
				"a:rPr",
			) ?? kid(p, "a:endParaRPr"),
		);
		const size = ((firstRun.sz ?? 1800) / 100) * ptPx * fontScale;
		const lnPct =
			props.lnSpcPct !== undefined ? (props.lnSpcPct / 100000) * (1 - spacingCut) : 1 - spacingCut;
		const lineHeight =
			props.lnSpcPts !== undefined
				? `${r2((props.lnSpcPts / 100) * ptPx)}px`
				: String(r2(lnPct * 1.2));
		const spc = (pts?: number, pct?: number) =>
			pts !== undefined ? (pts / 100) * ptPx : pct !== undefined ? (pct / 100000) * size * 1.2 : 0;
		const css = [
			`text-align:${props.algn === "ctr" ? "center" : props.algn === "r" ? "right" : props.algn === "just" || props.algn === "dist" ? "justify" : "left"}`,
			`font-size:${r2(size)}px`,
			`line-height:${lineHeight}`,
			props.marL ? `padding-left:${r2(props.marL * s)}px` : "",
			props.indent ? `text-indent:${r2(props.indent * s)}px` : "",
			spc(props.spcBefPts, props.spcBefPct)
				? `margin-top:${r2(spc(props.spcBefPts, props.spcBefPct))}px`
				: "",
			spc(props.spcAftPts, props.spcAftPct)
				? `margin-bottom:${r2(spc(props.spcAftPts, props.spcAftPct))}px`
				: "",
		].filter(Boolean);

		let bullet = "";
		const hasText = runs.some((r) => r.name !== "a:br" && textOf(kid(r, "a:t")) !== "");
		if (hasText && props.bullet && props.bullet.kind !== "none") {
			let mark: string;
			if (props.bullet.kind === "num") {
				const n = (counters.get(level) ?? props.bullet.start - 1) + 1;
				counters.set(level, n);
				mark = autoNumber(props.bullet.type, n);
			} else {
				const font = props.bullet.font ?? "";
				mark = /wingdings|symbol/i.test(font)
					? (SYMBOL_BULLETS[props.bullet.char] ?? "•")
					: props.bullet.char;
			}
			const color = cssColor(props.buClr ?? firstRun.color, ctx.colors);
			const width = props.indent && props.indent < 0 ? -props.indent * s : size;
			bullet = `<span style="display:inline-block;text-indent:0;width:${r2(width)}px;${color ? `color:${color};` : ""}${props.buSzPct ? `font-size:${r2(props.buSzPct * 100)}%;` : ""}">${esc(mark)}</span>`;
		} else counters.delete(level);

		let content = "";
		for (const r of runs) {
			if (r.name === "a:br") {
				content += "<br>";
				continue;
			}
			const rp = runProps(props, kid(r, "a:rPr"));
			let text = textOf(kid(r, "a:t"));
			if (r.name === "a:fld" && /slidenum/i.test(r.attribs.type ?? ""))
				text = String(ctx.slideNumber);
			if (!text) continue;
			const rcss: string[] = [];
			if (rp.sz !== undefined && rp.sz !== firstRun.sz)
				rcss.push(`font-size:${r2((rp.sz / 100) * ptPx * fontScale)}px`);
			const face = resolveFont(rp.font, ctx.fonts);
			if (face) rcss.push(`font-family:${fontStack(face)}`);
			if (rp.b) rcss.push("font-weight:700");
			if (rp.i) rcss.push("font-style:italic");
			const deco = [rp.u ? "underline" : "", rp.strike ? "line-through" : ""]
				.filter(Boolean)
				.join(" ");
			if (deco) rcss.push(`text-decoration:${deco}`);
			const color = cssColor(rp.color, ctx.colors);
			if (color) rcss.push(`color:${color}`);
			if (rp.cap === "all") rcss.push("text-transform:uppercase");
			else if (rp.cap === "small") rcss.push("font-variant:small-caps");
			if (rp.spc) rcss.push(`letter-spacing:${r2((rp.spc / 100) * ptPx)}px`);
			if (rp.baseline)
				rcss.push(`vertical-align:${rp.baseline > 0 ? "super" : "sub"};font-size:70%`);
			const highlight = kid(kid(r, "a:rPr"), "a:highlight");
			if (highlight) rcss.push(`background:${cssColor(colorChild(highlight), ctx.colors)}`);
			let span = `<span${rcss.length ? ` style="${rcss.join(";")}"` : ""}>${esc(text).replace(/\t/g, "&emsp;")}</span>`;
			const link = kid(kid(r, "a:rPr"), "a:hlinkClick")?.attribs["r:id"];
			const target = link ? ctx.pkg.rels(ctx.part).get(link) : undefined;
			if (target?.external && /^(https?:|mailto:)/i.test(target.target))
				span = `<a href="${attrEsc(target.target)}" target="_blank" rel="noopener">${span}</a>`;
			content += span;
		}
		html += `\n<p style="${css.join(";")}">${bullet}${content || "<br>"}</p>`;
	}
	return {
		html,
		padding: `${ins("tIns", 45720)}px ${ins("rIns", 91440)}px ${ins("bIns", 45720)}px ${ins("lIns", 91440)}px`,
		anchor,
		wrap,
	};
}

function renderPicture(
	pic: Element,
	t: Transform,
	ctx: SlideContext,
	ph: Placeholder | undefined,
): string {
	const chain = sources(ph, ctx);
	const spPr = kid(pic, "p:spPr");
	const xf =
		xfrmOf(kid(spPr, "a:xfrm")) ??
		chain
			.map((c) => xfrmOf(path(c, "p:spPr", "a:xfrm")))
			.filter(Boolean)
			.pop();
	if (!xf) return "";
	const blipFill = kid(pic, "p:blipFill");
	const url = blipFill ? imageUrl(blipFill, ctx, ctx.part) : null;
	const w = xf.w * t.sx * ctx.scale;
	const h = xf.h * t.sy * ctx.scale;
	if (!url) {
		// A format browsers can't show (EMF / WMF / TIFF …): its frame, marked.
		return `<div style="${boxCss(xf, t, ctx)}border:1px dashed #9ca3af"></div>`;
	}
	// srcRect crops the picture: scale it up and shift it inside the frame.
	const crop = kid(blipFill, "a:srcRect");
	const l = num(crop, "l") / 100000;
	const tp = num(crop, "t") / 100000;
	const rr = num(crop, "r") / 100000;
	const b = num(crop, "b") / 100000;
	const iw = w / Math.max(0.01, 1 - l - rr);
	const ih = h / Math.max(0.01, 1 - tp - b);
	const radius = kid(spPr, "a:prstGeom")?.attribs.prst === "ellipse" ? "border-radius:50%;" : "";
	const line = lineCss(kid(spPr, "a:ln"), ctx);
	const border = line ? `outline:${r2(line.width)}px solid ${line.color};` : "";
	return (
		`<div style="${boxCss(xf, t, ctx)}overflow:hidden;${radius}${border}">` +
		`<img src="${attrEsc(url)}" alt="${attrEsc(path(pic, "p:nvPicPr", "p:cNvPr")?.attribs.descr ?? "")}" style="position:absolute;left:${r2(-l * iw)}px;top:${r2(-tp * ih)}px;width:${r2(iw)}px;height:${r2(ih)}px;display:block"></div>`
	);
}

function renderFrame(frame: Element, t: Transform, ctx: SlideContext): string {
	const xf = xfrmOf(kid(frame, "p:xfrm"));
	if (!xf) return "";
	const tbl = find(frame, "a:tbl");
	if (tbl) return renderTable(tbl, xf, t, ctx);
	// Charts, SmartArt, OLE objects: their frame, marked.
	const uri = find(frame, "a:graphicData")?.attribs.uri ?? "";
	const label = /chart/.test(uri) ? "Chart" : /diagram/.test(uri) ? "SmartArt" : "Object";
	return `<div style="${boxCss(xf, t, ctx)}border:1px dashed #9ca3af;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:${r2(14)}px">${label}</div>`;
}

function renderTable(tbl: Element, xf: Xfrm, t: Transform, ctx: SlideContext): string {
	const s = ctx.scale;
	const cols = kids(kid(tbl, "a:tblGrid"), "a:gridCol").map((c) => num(c, "w") * t.sx * s);
	const rows = kids(tbl, "a:tr");
	let body = "";
	for (const tr of rows) {
		let cells = "";
		for (const tc of kids(tr, "a:tc")) {
			if (tc.attribs.hMerge === "1" || tc.attribs.vMerge === "1") continue;
			const tcPr = kid(tc, "a:tcPr");
			const span = num(tc, "gridSpan", 1);
			const rowSpan = num(tc, "rowSpan", 1);
			const m = (k: string, d: number) => r2(num(tcPr, k, d) * s);
			const css = [
				`padding:${m("marT", 45720)}px ${m("marR", 91440)}px ${m("marB", 45720)}px ${m("marL", 91440)}px`,
			];
			const fill = fillCss(tcPr, ctx, ctx.part);
			if (fill) css.push(`background:${fill}`);
			for (const [tag, side] of [
				["a:lnL", "left"],
				["a:lnR", "right"],
				["a:lnT", "top"],
				["a:lnB", "bottom"],
			] as const) {
				const line = lineCss(kid(tcPr, tag), ctx);
				if (line && kid(tcPr, tag))
					css.push(`border-${side}:${r2(line.width)}px solid ${line.color}`);
			}
			const anchor = tcPr?.attribs.anchor;
			if (anchor)
				css.push(
					`vertical-align:${anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : "top"}`,
				);
			// Cell text: its paragraphs (the cell's own margins pad them).
			const text = textBody(kid(tc, "a:txBody"), [], undefined, ctx)?.html ?? "";
			cells += `<td${span > 1 ? ` colspan="${span}"` : ""}${rowSpan > 1 ? ` rowspan="${rowSpan}"` : ""} style="${css.join(";")}">${text}</td>`;
		}
		body += `<tr style="height:${r2(num(tr, "h") * t.sy * s)}px">${cells}</tr>`;
	}
	const left = r2((t.tx + xf.x * t.sx) * s);
	const top = r2((t.ty + xf.y * t.sy) * s);
	return (
		`<table style="position:absolute;left:${left}px;top:${top}px;width:${r2(cols.reduce((a, b) => a + b, 0))}px">` +
		`<colgroup>${cols.map((w) => `<col style="width:${r2(w)}px">`).join("")}</colgroup><tbody>${body}</tbody></table>`
	);
}
