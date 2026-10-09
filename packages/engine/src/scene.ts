/**
 * A slide as paint items — the renderer-neutral output of the engine.
 * Rectangles (backgrounds, borders, rounded corners), text runs and images,
 * in paint order and slide coordinates (CSS px). Writers (PPTX, SVG …)
 * consume this without knowing about CSS.
 */

import type { Element } from "domhandler";
import { type Computed, toPx } from "./cascade";
import type { SlideLayout, TextBlock, TextLine } from "./layout";

export interface Color {
	/** `rrggbb` */
	hex: string;
	/** 0–1 */
	alpha: number;
}

export type SceneItem =
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
	  }
	| {
			kind: "text";
			x: number;
			y: number;
			w: number;
			h: number;
			text: string;
			/** `file`: the font file, when it may be embedded (not a system fallback). */
			font: { family: string; weight: number; italic: boolean; size: number; file?: string };
			color: Color;
			letterSpacing: number;
			/** Width of a space in this font and size (CSS px), to rebuild gaps between runs. */
			space: number;
			/** Block and line box the text sits in, to rebuild paragraphs (absent on list markers). */
			block?: TextBlock;
			line?: number;
			lineTop?: number;
			lineHeight?: number;
	  }
	| { kind: "image"; x: number; y: number; w: number; h: number; src: string };

export interface Scene {
	width: number;
	height: number;
	background: Color;
	items: SceneItem[];
}

const NAMED: Record<string, string> = {
	black: "000000",
	white: "ffffff",
	red: "ff0000",
	green: "008000",
	blue: "0000ff",
	gray: "808080",
	grey: "808080",
	orange: "ffa500",
	yellow: "ffff00",
	purple: "800080",
	transparent: "000000",
};

/** Parse a computed CSS color (hex, rgb[a](), named). Unknown → null. */
export function parseColor(value: string | undefined): Color | null {
	if (!value) return null;
	const v = value.trim().toLowerCase();
	if (v === "transparent" || v === "none") return { hex: "000000", alpha: 0 };
	const named = NAMED[v];
	if (named) return { hex: named, alpha: 1 };
	const hex = v.match(/^#([0-9a-f]{3,8})$/);
	if (hex) {
		let h = hex[1] ?? "";
		if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
		const alpha = h.length === 8 ? Number.parseInt(h.slice(6), 16) / 255 : 1;
		return { hex: h.slice(0, 6), alpha };
	}
	const rgb = v.match(/^rgba?\(([^)]+)\)$/);
	if (rgb) {
		const parts = (rgb[1] ?? "").split(/[\s,/]+/).filter(Boolean);
		const ch = (p: string | undefined) => {
			if (!p) return 0;
			const n = p.endsWith("%") ? (Number.parseFloat(p) * 255) / 100 : Number.parseFloat(p);
			return Math.max(0, Math.min(255, Math.round(n)));
		};
		const a = parts[3];
		const alpha =
			a === undefined ? 1 : a.endsWith("%") ? Number.parseFloat(a) / 100 : Number.parseFloat(a);
		return {
			hex: [parts[0], parts[1], parts[2]].map((p) => ch(p).toString(16).padStart(2, "0")).join(""),
			alpha: Number.isNaN(alpha) ? 1 : alpha,
		};
	}
	return null;
}

/** A length property in px (em against the element's font size, rem against 16px). */
function px(style: Computed, prop: string): number {
	const raw = (style.get(prop) ?? "0").trim().split(/\s+/)[0] ?? "0";
	const fontSize = Number.parseFloat(style.get("font-size") ?? "16");
	const n = toPx(raw, fontSize, 16, { width: 1920, height: 1080, media: "screen" });
	return Number.isNaN(n) ? 0 : n;
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
	const radius = px(style, "border-radius") || px(style, "border-top-left-radius");
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
			family: l.style.face.font.familyName,
			weight: l.style.face.weight,
			italic: l.style.face.italic,
			file: l.style.face.file,
			size: l.style.size,
		},
		color: { hex: color.hex, alpha: color.alpha * l.style.alpha },
		letterSpacing: l.style.letterSpacing,
		space: spaceWidth(l),
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
	const items: SceneItem[] = [];
	for (const b of layout.boxes) {
		if (b.alpha < 0.01 || (b.style.get("visibility") ?? "visible") === "hidden") continue;
		items.push(...boxRects(b.x, b.y, b.w, b.h, b.style, b.alpha));
		const el = elementOf?.(b.eid);
		if (b.tag === "img" && el?.attribs.src)
			items.push({ kind: "image", x: b.x, y: b.y, w: b.w, h: b.h, src: el.attribs.src });
	}
	for (const ib of layout.inlineBoxes) {
		if (ib.alpha < 0.01) continue;
		for (const r of boxRects(ib.x, ib.y, ib.w, ib.h, ib.style, ib.alpha))
			items.push(r.kind === "rect" ? { ...r, inline: true } : r);
	}
	for (const l of [...layout.markers, ...layout.lines]) {
		const t = textItem(l);
		if (t) items.push(t);
	}
	return {
		width: layout.width,
		height: layout.height,
		background: parseColor(layout.style.get("background-color")) ?? { hex: "ffffff", alpha: 1 },
		items,
	};
}
