/**
 * A slide's layout: its box tree (box-tree.ts) laid out by the layout core
 * (flow/), read back as boxes, text lines, inline boxes, tables and list
 * markers in slide coordinates, with transforms and clips applied.
 */

import type { Element } from "domhandler";
import { edgesOf, marginsOf } from "./box-model";
import { type ElementBox, isElement, StyleContext, type TextRun } from "./box-tree";
import { type Computed, computeStyle, type StyleSheets, type Viewport } from "./cascade";
import { Flow, type Fragment } from "./flow";
import type { NaturalSize } from "./images";
import { lookup } from "./lookup";
import { clipsOverflow, keyword } from "./properties";
import { type FontRegistry, type InlineStyle, verticalMetrics } from "./text";
import { type Affine, boxTransform, compose, IDENTITY, mapRect } from "./transform";

/** A rectangle in slide coordinates. */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Box {
	eid: number;
	tag: string;
	x: number;
	y: number;
	w: number;
	h: number;
	style: Computed;
	/** Effective opacity (element × ancestors). */
	alpha: number;
	/** Where ancestors with `overflow` other than visible let it show (absent: nowhere clipped). */
	clip?: Rect;
	/** An iframe's content box (inside its padding and border), where its document shows. */
	content?: Rect;
}

/** The part of an inline element's box (background / border) on one line. */
export interface InlineBox {
	eid: number;
	tag: string;
	x: number;
	y: number;
	w: number;
	h: number;
	style: Computed;
	alpha: number;
	clip?: Rect;
}

/** A block's content box that text was laid out in (one per block of inline content). */
export interface TextBlock {
	id: number;
	x: number;
	w: number;
	align: string;
}

export interface TextLine {
	text: string;
	x: number;
	y: number;
	w: number;
	h: number;
	style: InlineStyle;
	/** See {@link Box.clip}. */
	clip?: Rect;
	/** The text block and the line box in it (absent on list markers). */
	block?: TextBlock;
	line?: number;
	lineTop?: number;
	lineHeight?: number;
}

export interface SlideLayout {
	width: number;
	height: number;
	/** The slide element's own computed style (background …). */
	style: Computed;
	/** The slide's padding, in px. */
	padding: Sides;
	boxes: Box[];
	inlineBoxes: InlineBox[];
	lines: TextLine[];
	/** List item markers (•, 1. …), positioned like Chromium's outside markers. */
	markers: TextLine[];
	/** Tables, with their grid (their cells are also in `boxes`). */
	tables: TableBox[];
	/** Slide descendants by element id (document order). */
	elements: Element[];
}

/** The overlap of two rectangles (zero-sized when they don't meet). */
export function intersect(a: Rect, b: Rect): Rect {
	const x = Math.max(a.x, b.x);
	const y = Math.max(a.y, b.y);
	return {
		x,
		y,
		w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
		h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
	};
}

/** A laid-out table: rows of cells on a column grid, in slide coordinates. */
export interface TableBox {
	eid: number;
	x: number;
	y: number;
	w: number;
	h: number;
	/** Column widths (border boxes of single-column cells). */
	columns: number[];
	rows: {
		eid: number;
		y: number;
		h: number;
		cells: TableCellBox[];
	}[];
}

export interface TableCellBox {
	eid: number;
	col: number;
	span: number;
	x: number;
	y: number;
	w: number;
	h: number;
	style: Computed;
	/** Resolved padding and border widths (px), per side. */
	padding: Sides;
	border: Sides;
}

export interface Sides {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/** Lay out one slide element. `ancestors` are its ancestors from <html> down. */
export function layoutSlide(
	slide: Element,
	ancestors: Element[],
	sheets: StyleSheets,
	fonts: FontRegistry,
	vp: Viewport,
	/** Natural sizes of the images the slide shows (see images.ts). */
	images?: (src: string) => NaturalSize | null,
): SlideLayout {
	const ctx = new StyleContext(sheets, fonts, vp);
	if (images) ctx.images = images;
	let parent: Computed | null = null;
	for (const a of ancestors) {
		parent = ctx.styleOf(a, parent);
		if (a.name === "html") ctx.rootFontSize = Number.parseFloat(parent.get("font-size") ?? "16");
	}
	// Element ids in document order (matches querySelectorAll("*") in the slide).
	let next = 0;
	const number = (el: Element) => {
		for (const c of el.children) {
			if (isElement(c)) {
				ctx.eids.set(c, next++);
				number(c);
			}
		}
	};
	number(slide);

	const slideStyle = ctx.styleOf(slide, parent);
	return layoutTree(ctx, ctx.box(slide, slideStyle), slideStyle, sheets, fonts, vp);
}

const MARKERS: Record<string, string> = lookup({ disc: "•", circle: "◦", square: "▪" });

/** Outside list markers: text ends at the item's border-box start, on its first baseline. */
function listMarkers(
	ctx: StyleContext,
	boxes: Box[],
	lines: TextLine[],
	sheets: StyleSheets,
	fonts: FontRegistry,
): TextLine[] {
	const out: TextLine[] = [];
	const counters = new Map<Element | null, number>();
	for (const box of boxes) {
		if ((box.style.get("display") ?? "") !== "list-item") continue;
		const type = box.style.get("list-style-type") ?? "disc";
		if (type === "none") continue;
		const el = [...ctx.eids].find(([, id]) => id === box.eid)?.[0];
		if (!el) continue;
		const n = (counters.get(el.parent as Element | null) ?? 0) + 1;
		counters.set(el.parent as Element | null, n);
		const text = MARKERS[type] ?? (type === "decimal" ? `${n}.` : "•");
		const ms = computeStyle(sheets.declared(el, "marker"), {
			parent: box.style,
			rootFontSize: ctx.rootFontSize,
			vp: ctx.vp,
		});
		ms.set("__alpha", box.style.get("__alpha") ?? "1");
		const style = ctx.inlineStyle(ms);
		// The item's first line: by its line box (glyphs overflow a tight line-height), inside the item.
		const first = lines
			.filter((l) => {
				const top = l.lineTop ?? l.y;
				return top >= box.y - 1 && top < box.y + box.h && l.x >= box.x - 1 && l.x < box.x + box.w;
			})
			.reduce<TextLine | undefined>(
				(best, l) => (!best || (l.lineTop ?? l.y) < (best.lineTop ?? best.y) ? l : best),
				undefined,
			);
		if (!first) continue;
		const baseline = first.y + verticalMetrics(first.style.face, first.style.size).ascent;
		const m = verticalMetrics(style.face, style.size);
		const w = fonts.width(style.face, style.size, `${text} `, style.letterSpacing);
		out.push({
			text,
			x: box.x - w,
			y: baseline - m.ascent,
			w: fonts.width(style.face, style.size, text),
			h: m.ascent + m.descent,
			style,
		});
	}
	return out;
}

/**
 * A slide's box tree laid out by the layout core (flow/) and read back as
 * boxes, lines, inline boxes, markers and tables in slide coordinates, in
 * the box tree's order (paint order).
 */
function layoutTree(
	ctx: StyleContext,
	tree: ElementBox | null,
	slideStyle: Computed,
	sheets: StyleSheets,
	fonts: FontRegistry,
	vp: Viewport,
): SlideLayout {
	const empty: SlideLayout = {
		width: 0,
		height: 0,
		style: slideStyle,
		padding: { top: 0, right: 0, bottom: 0, left: 0 },
		boxes: [],
		inlineBoxes: [],
		lines: [],
		markers: [],
		tables: [],
		elements: [],
	};
	if (!tree) return empty;
	const flow = new Flow(ctx);
	const auto = (prop: string) => (slideStyle.get(prop) ?? "auto") === "auto";
	// The viewport is the root's containing block: an auto size fills it inside the margins.
	const rm = marginsOf(ctx, slideStyle, vp.width);
	const root = flow.layout(tree, {
		available: vp.width,
		pctW: vp.width,
		pctH: vp.height,
		...(auto("width") ? { width: Math.max(0, vp.width - rm.left - rm.right) } : {}),
		...(auto("height") ? { height: Math.max(0, vp.height - rm.top - rm.bottom) } : {}),
	});
	// The slide is the containing block of what's still positioned against nothing.
	const rootBorder = edgesOf(ctx, slideStyle).border;
	for (const p of root.pending) root.kids.push(flow.placeAbsolute(p, root, rootBorder));
	root.pending = [];

	/** Where each box and text run ended up, in slide coordinates. */
	const placedBox = new Map<ElementBox, Box>();
	const placedText = new Map<
		TextRun,
		{ x: number; y: number; f: Fragment; a: Affine; clip?: Rect }
	>();
	const tableFrags = new Map<ElementBox, { f: Fragment; x: number; y: number; a: Affine }>();
	const rowBoxes = new Map<number, Box>();
	const walk = (f: Fragment, x: number, y: number, clip: Rect | undefined, outer: Affine) => {
		if (f.box.type === "text") {
			placedText.set(f.box, { x, y, f, a: outer, ...(clip ? { clip } : {}) });
			// Its atomic inlines.
			for (const k of f.kids) walk(k.f, x + k.x, y + k.y, clip, outer);
			return;
		}
		const { style } = f.box;
		let a = outer;
		const transform = style.get("transform");
		if (transform && transform !== "none") {
			const own = boxTransform(
				transform,
				style.get("transform-origin") ?? "",
				{ x, y, w: f.w, h: f.h },
				(v, basis) => ctx.lengthIn(style, v, basis),
			);
			if (own) a = compose(a, own);
		}
		const box: Box = mapRect(a, {
			...(clip ? { clip } : {}),
			eid: f.box.eid,
			tag: f.box.el.name,
			x,
			y,
			w: f.w,
			h: f.h,
			style,
			alpha: Number(style.get("__alpha") ?? 1),
		});
		if (f.box.el.name === "iframe") {
			const { padding, border } = edgesOf(ctx, style);
			box.content = mapRect(a, {
				x: x + border.left + padding.left,
				y: y + border.top + padding.top,
				w: f.w - border.left - padding.left - border.right - padding.right,
				h: f.h - border.top - padding.top - border.bottom - padding.bottom,
			});
		}
		const row = f.box.el.name === "tr" || keyword(style, "display") === "table-row";
		// Table rows are listed with their table (rowBoxes), the rest by box.
		if (!row) placedBox.set(f.box, box);
		if (f.box.kind === "table") tableFrags.set(f.box, { f, x, y, a });
		if (row) rowBoxes.set(f.box.eid, box);
		let inner = clip;
		if (clipsOverflow(style)) {
			const { border } = edgesOf(ctx, style);
			const own = mapRect(a, {
				x: x + border.left,
				y: y + border.top,
				w: f.w - border.left - border.right,
				h: f.h - border.top - border.bottom,
			});
			inner = inner ? intersect(inner, own) : own;
		}
		for (const k of f.kids) walk(k.f, x + k.x, y + k.y, inner, a);
	};
	walk(root, rm.left, rm.top, undefined, IDENTITY);

	const boxes: Box[] = [];
	const lines: TextLine[] = [];
	const inlineBoxes: InlineBox[] = [];
	let leafId = 0;
	const emitText = (run: TextRun) => {
		const id = leafId++;
		const at = placedText.get(run);
		const r = at?.f.lines;
		if (!at || !r) return;
		const { x: px, y: py, f, a, clip } = at;
		const block: TextBlock = { id, x: a.sx * px + a.tx, w: a.sx * f.w, align: run.align };
		const scaled = (st: InlineStyle): InlineStyle =>
			a.sy === 1 && a.sx === 1
				? st
				: {
						...st,
						size: st.size * a.sy,
						lineHeight: st.lineHeight * a.sy,
						letterSpacing: st.letterSpacing * a.sx,
					};
		for (const fr of r.fragments)
			lines.push(
				mapRect(a, {
					text: fr.text,
					x: px + fr.x,
					y: py + fr.y,
					w: fr.w,
					h: fr.h,
					style: scaled(fr.style),
					...(clip ? { clip } : {}),
					block,
					line: fr.line,
					lineTop: a.sy * (py + fr.lineTop) + a.ty,
					lineHeight: a.sy * fr.lineHeight,
				}),
			);
		for (const ib of r.inlineBoxes) {
			const entry = ctx.inlineEls[ib.id];
			if (!entry) continue;
			const is = ctx.inlineStyle(entry.style);
			const m = verticalMetrics(is.face, is.size);
			const v = (prop: string) => {
				const n = ctx.px(entry.style, prop);
				return Number.isNaN(n) ? 0 : n;
			};
			const top = v("padding-top") + v("border-top-width");
			const bottom = v("padding-bottom") + v("border-bottom-width");
			inlineBoxes.push(
				mapRect(a, {
					eid: ctx.eids.get(entry.el) ?? -1,
					tag: entry.el.name,
					x: px + ib.x,
					y: py + ib.baseline - m.ascent - top,
					w: ib.w,
					h: m.ascent + m.descent + top + bottom,
					style: entry.style,
					alpha: is.alpha,
					...(clip ? { clip } : {}),
				}),
			);
		}
	};
	const emit = (box: ElementBox, top: boolean) => {
		const b = placedBox.get(box);
		if (b && !top) boxes.push(b);
		for (const c of box.children) {
			if (c.type === "text") {
				emitText(c);
				for (const it of c.items) if (it.kind === "atomic") emit(it.box as ElementBox, false);
			} else emit(c, false);
		}
		for (const row of box.rows ?? []) {
			const rb = rowBoxes.get(row.eid);
			if (rb) boxes.push(rb);
			for (const c of row.cells) emit(c.box, false);
		}
	};
	emit(tree, true);
	const tables: TableBox[] = [];
	for (const [tb, { f, x, y, a }] of tableFrags) {
		const rows = f.kids.map((rk) => ({
			eid: (rk.f.box as ElementBox).eid,
			y: a.sy * (y + rk.y) + a.ty,
			h: a.sy * rk.f.h,
			cells: rk.f.kids.map((ck, i) => {
				const cb = ck.f.box as ElementBox;
				const row = tb.rows?.find((r) => r.eid === (rk.f.box as ElementBox).eid);
				let col = 0;
				for (const c of row?.cells.slice(0, i) ?? []) col += c.span;
				const span = row?.cells[i]?.span ?? 1;
				const { padding, border } = edgesOf(ctx, cb.style, ck.f.w);
				return {
					eid: cb.eid,
					col,
					span,
					x: a.sx * (x + rk.x + ck.x) + a.tx,
					y: a.sy * (y + rk.y + ck.y) + a.ty,
					w: a.sx * ck.f.w,
					h: a.sy * ck.f.h,
					style: cb.style,
					padding,
					border,
				};
			}),
		}));
		tables.push({
			eid: tb.eid,
			x: a.sx * x + a.tx,
			y: a.sy * y + a.ty,
			w: a.sx * f.w,
			h: a.sy * f.h,
			columns: (f.columns ?? []).map((w) => a.sx * w),
			rows,
		});
	}
	const markers = listMarkers(ctx, boxes, lines, sheets, fonts);
	return {
		width: root.w,
		height: root.h,
		style: slideStyle,
		// Percentages are of the viewport, the slide's containing block.
		padding: edgesOf(ctx, slideStyle, vp.width).padding,
		boxes,
		inlineBoxes,
		lines,
		markers,
		tables,
		elements: [...ctx.eids.keys()],
	};
}
