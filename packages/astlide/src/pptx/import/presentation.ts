/**
 * A presentation opened for import: its slide size, theme, masters and
 * layouts, a slide's context, and the artwork behind its content.
 *
 * @module
 */

import { posix } from "node:path";
import {
	type ColorContext,
	type ColorMap,
	cssColor,
	DEFAULT_COLOR_MAP,
	type ThemeColors,
} from "../color";
import type { PptxImportOptions } from "../import";
import { fontFromEot } from "../ooxml/eot";
import { type Element, kid, kids, num, parseXml, path } from "../ooxml/xml";
import { readZip } from "../ooxml/zip";
import { backgroundCss } from "./fills";
import { fontStack, safeFontName } from "./fonts";
import { r2 } from "./html";
import { MAX_EMBEDDED_FONTS, MAX_SLIDES, MIME, Package, REL } from "./package";
import { renderTree } from "./shapes";

/** Maps EMU coordinates of a (group) child to slide EMU. */
export interface Transform {
	sx: number;
	sy: number;
	tx: number;
	ty: number;
}

export const IDENTITY: Transform = { sx: 1, sy: 1, tx: 0, ty: 0 };

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
		const type = Object.hasOwn(MIME, ext) ? MIME[ext] : undefined;
		let url: string | null = null;
		if (bytes && type) {
			url =
				options.media && type !== "image/svg+xml"
					? options.media({ name: posix.basename(part), data: bytes, type })
					: `data:${type};base64,${bytes.toString("base64")}`;
		}
		mediaUrls.set(part, url);
		return url;
	};

	const rels = pkg.rels(presentationPart);
	// Fonts embedded in the file (PowerPoint "Embed fonts"): @font-face rules, when they can be served.
	// Each family / face once, at most MAX_EMBEDDED_FONTS families, each font part
	// unpacked once: a crafted file can list one font many times, and the rules go into every slide.
	let fontCss = "";
	if (options.media) {
		const faces = new Set<string>();
		const families = new Set<string>();
		const fontUrls = new Map<string, string | null>();
		for (const ef of kids(kid(presentation, "p:embeddedFontLst"), "p:embeddedFont")) {
			const family = safeFontName(kid(ef, "p:font")?.attribs.typeface);
			if (!family) continue;
			if (!families.has(family) && families.size >= MAX_EMBEDDED_FONTS) break;
			families.add(family);
			for (const [slot, weight, style] of [
				["regular", 400, "normal"],
				["bold", 700, "normal"],
				["italic", 400, "italic"],
				["boldItalic", 700, "italic"],
			] as const) {
				if (faces.has(`${family}/${slot}`)) continue;
				const id = kid(ef, `p:${slot}`)?.attribs["r:id"];
				const target = id ? rels.get(id)?.target : undefined;
				if (!target) continue;
				if (!fontUrls.has(target)) {
					const font = fontFromEot(pkg.files.get(target));
					fontUrls.set(
						target,
						font
							? options.media({ name: `${family}-${slot}.ttf`, data: font, type: "font/ttf" })
							: null,
					);
				}
				const url = fontUrls.get(target);
				if (!url) continue;
				faces.add(`${family}/${slot}`);
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
	return `<div class="astlide-pptx-canvas" style="left:${r2(p.offsetX)}px;top:${r2(p.offsetY)}px;width:${r2(p.width * p.scale)}px;height:${r2(p.height * p.scale)}px;${background}${ctx.fonts.minor || ctx.fonts.minorEa ? `font-family:${fontStack(ctx.fonts.minor, ctx.fonts.minorEa)};` : ""}color:${cssColor(schemeEl("tx1"), ctx.colors) ?? "#000"}">`;
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
