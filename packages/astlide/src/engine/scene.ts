/**
 * A slide as paint items — the renderer-neutral output of the engine.
 * Rectangles (backgrounds, borders, rounded corners), text runs and images,
 * in paint order and slide coordinates (CSS px). Writers (PPTX, SVG …)
 * consume this without knowing about CSS.
 */

import render from "dom-serializer";
import type { Element } from "domhandler";
import type { Computed } from "./cascade";
import { type Color, parseColor } from "./color";
import type { Rect, SlideLayout, TextBlock, TextLine } from "./layout";
import { keyword, value } from "./properties";

export type SceneItem = (
	| {
			kind: "rect";
			x: number;
			y: number;
			w: number;
			h: number;
			fill?: Color;
			border?: { width: number; color: Color };
			radius?: number;
			/** Background of an inline element (inline code …): it flows with its text. */
			inline?: boolean;
			/** A linear-gradient background (instead of `fill`). */
			gradient?: Gradient;
			/** Thin parallel lines (a repeating-linear-gradient hatch) over what's below. */
			stripes?: Stripes;
	  }
	| {
			kind: "text";
			x: number;
			y: number;
			w: number;
			h: number;
			text: string;
			/**
			 * `file`: the font file, when it may be embedded (not a system fallback).
			 * `italic`: the text is italic (CSS); `fileItalic`: the file is an italic
			 * face — without one, italic text is the upright face, slanted.
			 */
			font: {
				family: string;
				weight: number;
				italic: boolean;
				fileItalic: boolean;
				size: number;
				file?: string;
			};
			color: Color;
			letterSpacing: number;
			/** Width of a space in this font and size (CSS px), to rebuild gaps between runs. */
			space: number;
			underline?: boolean;
			strike?: boolean;
			/** Block and line box the text sits in, to rebuild paragraphs (absent on list markers). */
			block?: TextBlock;
			line?: number;
			lineTop?: number;
			lineHeight?: number;
	  }
	| {
			kind: "image";
			x: number;
			y: number;
			w: number;
			h: number;
			src: string;
			/**
			 * Placed in the box by these (a CSS background image, or `object-fit`)
			 * and clipped to it; without it the image fills the box.
			 */
			fit?: { size: string; position: string };
			/** Link of the image (an enclosing `<a href>`). */
			href?: string;
	  }
	| {
			/** An `<iframe>`: its content can't be drawn here (see the exporter's fallback). */
			kind: "embed";
			x: number;
			y: number;
			w: number;
			h: number;
			src: string;
			title: string;
	  }
	| {
			kind: "svg";
			x: number;
			y: number;
			w: number;
			h: number;
			/** The `<svg>` element's markup. */
			markup: string;
			/** Its CSS `color` (what `currentColor` means inside). */
			color: Color;
			/** Its CSS `font-family` and `font-size` (px), inherited by SVG text. */
			fontFamily: string;
			fontSize: number;
	  }
) & {
	/** Only this part shows (ancestors' overflow); absent: not clipped. */
	clip?: Rect;
};

/** CSS `linear-gradient()`: angle in degrees (0 = to top) and stops at 0–1. */
export interface Gradient {
	angle: number;
	stops: { color: Color; pos: number }[];
}

/**
 * Parallel lines: CSS angle of the gradient (0 = to top, so the lines run
 * across it), their color, and the distance between them in px.
 */
export interface Stripes {
	angle: number;
	color: Color;
	period: number;
}

/**
 * Parse a hatch: `repeating-linear-gradient(<angle>, <color> 0 <w>px,
 * transparent <w>px <period>px)` (unknown forms → null).
 */
export function parseStripes(value: string): Stripes | null {
	const m = value.trim().match(/^(?:-webkit-)?repeating-linear-gradient\((.*)\)$/s);
	if (!m) return null;
	const args = topLevel(m[1] ?? "");
	let angle = 180;
	const first = (args[0] ?? "").toLowerCase();
	const deg = first.match(/^(-?[\d.]+)deg$/);
	if (deg) {
		angle = Number(deg[1]);
		args.shift();
	} else if (first in SIDES) {
		angle = SIDES[first] ?? 180;
		args.shift();
	}
	if (args.length !== 2) return null;
	const line = args[0]?.match(/^(.*?)\s+0(?:px)?\s+[\d.]+px$/);
	const gap = args[1]?.match(/^transparent\s+[\d.]+px\s+([\d.]+)px$/);
	const color = line?.[1] ? parseColor(line[1]) : null;
	if (!color || !gap) return null;
	return { angle: ((angle % 360) + 360) % 360, color, period: Number(gap[1]) };
}

/** Split on commas outside parentheses. */
function topLevel(value: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < value.length; i++) {
		const c = value[i];
		if (c === "(") depth++;
		else if (c === ")") depth--;
		else if (c === "," && depth === 0) {
			out.push(value.slice(start, i).trim());
			start = i + 1;
		}
	}
	out.push(value.slice(start).trim());
	return out.filter(Boolean);
}

const SIDES: Record<string, number> = {
	"to top": 0,
	"to right": 90,
	"to bottom": 180,
	"to left": 270,
	"to top right": 45,
	"to right top": 45,
	"to bottom right": 135,
	"to right bottom": 135,
	"to bottom left": 225,
	"to left bottom": 225,
	"to top left": 315,
	"to left top": 315,
};

/** Parse `linear-gradient(...)` (unknown colors → null). */
export function parseLinearGradient(value: string): Gradient | null {
	const m = value.trim().match(/^(?:-webkit-)?linear-gradient\((.*)\)$/s);
	if (!m) return null;
	const args = topLevel(m[1] ?? "");
	let angle = 180;
	const first = (args[0] ?? "").toLowerCase();
	const deg = first.match(/^(-?[\d.]+)(deg|turn|rad)$/);
	if (deg) {
		const n = Number(deg[1]);
		angle = deg[2] === "turn" ? n * 360 : deg[2] === "rad" ? (n * 180) / Math.PI : n;
		args.shift();
	} else if (first in SIDES) {
		angle = SIDES[first] ?? 180;
		args.shift();
	}
	const stops: { color: Color; pos: number | null }[] = [];
	for (const a of args) {
		const pos = a.match(/\s(-?[\d.]+)%$/);
		const color = parseColor(pos ? a.slice(0, pos.index).trim() : a);
		if (!color) return null;
		stops.push({ color, pos: pos ? Number(pos[1]) / 100 : null });
	}
	if (stops.length < 2) return null;
	// Missing positions: first 0, last 1, the rest evenly between their neighbours.
	if (stops[0] && stops[0].pos === null) stops[0].pos = 0;
	const last = stops[stops.length - 1];
	if (last && last.pos === null) last.pos = 1;
	for (let i = 1; i < stops.length - 1; i++) {
		if (stops[i]?.pos !== null) continue;
		let j = i;
		while (stops[j]?.pos === null) j++;
		const a = stops[i - 1]?.pos ?? 0;
		const b = stops[j]?.pos ?? 1;
		for (let q = i; q < j; q++) {
			const s = stops[q];
			if (s) s.pos = a + ((b - a) * (q - i + 1)) / (j - i + 1);
		}
	}
	return { angle, stops: stops.map((s) => ({ color: s.color, pos: s.pos ?? 0 })) };
}

/** Background image layers (bottom first) as scene items; `background-clip: text` paints none. */
function backgroundLayers(
	x: number,
	y: number,
	w: number,
	h: number,
	style: Computed,
	alpha: number,
): SceneItem[] {
	const image = value(style, "background-image");
	if (image === "none") return [];
	// Gradient text: the standard property or the -webkit- one (both stay set; neither is a fallback).
	if (
		/text/.test(`${value(style, "background-clip")} ${style.get("-webkit-background-clip") ?? ""}`)
	)
		return [];
	const radius = radiusOf(style, w, h);
	const out: SceneItem[] = [];
	for (const layer of topLevel(image).reverse()) {
		const url = layer.match(/^url\(\s*["']?([^"')]+)["']?\s*\)$/);
		if (url?.[1]) {
			out.push({
				kind: "image",
				x,
				y,
				w,
				h,
				src: url[1],
				fit: {
					size: value(style, "background-size"),
					position: value(style, "background-position"),
				},
			});
			continue;
		}
		const stripes = parseStripes(layer);
		if (stripes) {
			out.push({
				kind: "rect",
				x,
				y,
				w,
				h,
				radius: radius || undefined,
				stripes: { ...stripes, color: { ...stripes.color, alpha: stripes.color.alpha * alpha } },
			});
			continue;
		}
		const g = parseLinearGradient(layer);
		if (g)
			out.push({
				kind: "rect",
				x,
				y,
				w,
				h,
				radius: radius || undefined,
				gradient: {
					angle: g.angle,
					stops: g.stops.map((s) => ({
						...s,
						color: { ...s.color, alpha: s.color.alpha * alpha },
					})),
				},
			});
	}
	return out;
}

export interface Scene {
	width: number;
	height: number;
	background: Color;
	items: SceneItem[];
}

/** A border width in px: the cascade keeps it in px before zoom, as the layout reads it. */
function px(style: Computed, prop: string): number {
	const zoom = Number(style.get("__zoom") ?? 1) || 1;
	const n = Number.parseFloat(value(style, prop));
	return Number.isNaN(n) ? 0 : n * zoom;
}

/** The `href` of the closest enclosing link. */
function linkOf(el: Element): string | undefined {
	for (let n: Element | null = el; n; n = n.parent as Element | null) {
		if (n.type !== "tag") return undefined;
		if (n.name === "a" && n.attribs.href) return n.attribs.href;
	}
	return undefined;
}

/** Corner radius in px (a % is of the box's shorter side; 50% makes a circle / pill). */
function radiusOf(style: Computed, w: number, h: number): number {
	const raw = value(style, "border-top-left-radius");
	if (raw.endsWith("%")) return (Number.parseFloat(raw) / 100) * Math.min(w, h);
	return Number.parseFloat(raw) || 0;
}

/** Fill + borders of a box as rect items (uniform border → one rect; otherwise per-side strips). */
function boxRects(
	x: number,
	y: number,
	w: number,
	h: number,
	style: Computed,
	alpha: number,
): SceneItem[] {
	const out: SceneItem[] = [];
	const fill = parseColor(style.get("background-color"));
	const radius = radiusOf(style, w, h);
	const sides = (["top", "right", "bottom", "left"] as const).map((s) => ({
		side: s,
		width: px(style, `border-${s}-width`),
		color: parseColor(style.get(`border-${s}-color`) ?? style.get("color")),
	}));
	const visible = sides.filter((s) => s.width > 0 && s.color && s.color.alpha > 0);
	const uniform =
		visible.length === 4 &&
		visible.every((s) => s.width === visible[0]?.width && s.color?.hex === visible[0]?.color?.hex);
	const withAlpha = (c: Color): Color => ({ hex: c.hex, alpha: c.alpha * alpha });
	if ((fill && fill.alpha > 0) || uniform) {
		out.push({
			kind: "rect",
			x,
			y,
			w,
			h,
			fill: fill && fill.alpha > 0 ? withAlpha(fill) : undefined,
			border:
				uniform && visible[0]?.color
					? { width: visible[0].width, color: withAlpha(visible[0].color) }
					: undefined,
			radius: radius || undefined,
		});
	}
	if (!uniform) {
		for (const s of visible) {
			if (!s.color) continue;
			const strip =
				s.side === "top"
					? { x, y, w, h: s.width }
					: s.side === "bottom"
						? { x, y: y + h - s.width, w, h: s.width }
						: s.side === "left"
							? { x, y, w: s.width, h }
							: { x: x + w - s.width, y, w: s.width, h };
			out.push({ kind: "rect", ...strip, fill: withAlpha(s.color) });
		}
	}
	return out;
}

function spaceWidth(l: TextLine): number {
	const font = l.style.face.font;
	const advance = font.glyphForCodePoint(0x20)?.advanceWidth ?? font.unitsPerEm / 4;
	return (advance / font.unitsPerEm) * l.style.size + l.style.letterSpacing;
}

function textItem(l: TextLine): SceneItem | null {
	const color = parseColor(l.style.color);
	if (!color || l.style.alpha * color.alpha < 0.01) return null;
	return {
		kind: "text",
		x: l.x,
		y: l.y,
		w: l.w,
		h: l.h,
		text: l.text,
		font: {
			// The family asked for, when it was measured with a stand-in (whose file isn't it).
			family: l.style.requested ?? l.style.face.font.familyName,
			weight: l.style.face.weight,
			italic: l.style.italic,
			fileItalic: l.style.face.italic,
			file: l.style.requested ? undefined : l.style.face.file,
			size: l.style.size,
		},
		color: { hex: color.hex, alpha: color.alpha * l.style.alpha },
		letterSpacing: l.style.letterSpacing,
		space: spaceWidth(l),
		underline: l.style.underline,
		strike: l.style.strike,
		block: l.block,
		line: l.line,
		lineTop: l.lineTop,
		lineHeight: l.lineHeight,
	};
}

/**
 * Paint order: block boxes in tree order, inline box backgrounds, list
 * markers, then text (text sits on top of every background here).
 */
export function toScene(
	layout: SlideLayout,
	elementOf?: (eid: number) => Element | undefined,
): Scene {
	// The slide's own background image / gradient, under everything.
	const items: SceneItem[] = backgroundLayers(0, 0, layout.width, layout.height, layout.style, 1);
	for (const b of layout.boxes) {
		if (b.alpha < 0.01 || keyword(b.style, "visibility") === "hidden") continue;
		const first = items.length;
		items.push(...boxRects(b.x, b.y, b.w, b.h, b.style, b.alpha));
		items.push(...backgroundLayers(b.x, b.y, b.w, b.h, b.style, b.alpha));
		const el = elementOf?.(b.eid);
		if (b.tag === "img" && el?.attribs.src) {
			const fit = value(b.style, "object-fit");
			items.push({
				kind: "image",
				x: b.x,
				y: b.y,
				w: b.w,
				h: b.h,
				src: el.attribs.src,
				fit:
					fit === "fill"
						? undefined
						: {
								size: fit === "none" ? "auto" : fit === "scale-down" ? "contain" : fit,
								position: value(b.style, "object-position"),
							},
				href: linkOf(el),
			});
		}
		// An embed with a static stand-in (data-astlide-static) is drawn by that; others by the exporter.
		if (
			b.tag === "iframe" &&
			el &&
			!("data-astlide-framed" in el.attribs) &&
			!el.parent?.children.some(
				(c) => c.type === "tag" && "data-astlide-static" in (c as Element).attribs,
			)
		)
			items.push({
				kind: "embed",
				x: b.x,
				y: b.y,
				w: b.w,
				h: b.h,
				src: el.attribs.src ?? "",
				title: el.attribs.title ?? "",
			});
		if (b.tag === "svg" && el)
			items.push({
				kind: "svg",
				x: b.x,
				y: b.y,
				w: b.w,
				h: b.h,
				markup: render(el, { xmlMode: true }),
				color: parseColor(b.style.get("color")) ?? { hex: "000000", alpha: 1 },
				fontFamily: value(b.style, "font-family"),
				fontSize: Number.parseFloat(value(b.style, "font-size")) || 16,
			});
		if (b.clip) for (let i = first; i < items.length; i++) (items[i] as SceneItem).clip = b.clip;
	}
	for (const ib of layout.inlineBoxes) {
		if (ib.alpha < 0.01) continue;
		for (const r of boxRects(ib.x, ib.y, ib.w, ib.h, ib.style, ib.alpha))
			items.push(r.kind === "rect" ? { ...r, inline: true, clip: ib.clip } : r);
	}
	for (const l of [...layout.markers, ...layout.lines]) {
		const t = textItem(l);
		if (t) items.push(l.clip ? { ...t, clip: l.clip } : t);
	}
	return {
		width: layout.width,
		height: layout.height,
		background: parseColor(layout.style.get("background-color")) ?? { hex: "ffffff", alpha: 1 },
		items,
	};
}
