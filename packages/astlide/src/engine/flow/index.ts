/**
 * Layout as a function of constraints (#357): `layout(box, space)` lays out a
 * box of the box tree (box-tree.ts) in a constraint space and returns a
 * fragment — its size and its children's positions — without carrying state
 * from one call to the next. Intrinsic sizes (css-sizing-3 §5) come from the
 * content, without regard to the context; heights come from laying content
 * out at a width.
 *
 * This file sizes a box in its parent (box model, replaced elements,
 * positioning) and hands its content to its formatting context, each of
 * which lays its children out and reports their content sizes:
 *
 * - block.ts: block flow, margin collapsing (CSS 2 §10.3.3, §10.6.3, §8.3.1)
 * - inline.ts: lines of text and atomic inlines, baselines (CSS 2 §10.8)
 * - flex.ts: flexbox (css-flexbox-1 §9, §4.5)
 * - grid.ts: grid (css-grid-1 §11)
 * - table.ts: automatic table layout, collapsed borders (CSS 2 §17)
 */

import {
	type BoxModel,
	boxModel,
	clampHeight,
	clampWidth,
	contentHeight,
	contentWidth,
	lengthOf,
	marginsOf,
	outerWidth,
	replacedSize,
	type SIDES,
	type Sides,
} from "../box-model";
import type { ElementBox, StyleContext, TextRun } from "../box-tree";
import type { Computed } from "../cascade";
import { isAbsolute, isAuto, isPositioned, keyword, value } from "../properties";
import type { LineBreakResult } from "../text";

import { blockSizes, layoutBlock } from "./block";
import { flexSizes, layoutFlex } from "./flex";
import { gridSizes, layoutGrid } from "./grid";
import { layoutText, rowBaseline, textSizes } from "./inline";
import { layoutTable, tableSizes } from "./table";
/** Min-content and max-content widths, px (css-sizing-3 §5). */
export interface Sizes {
	min: number;
	max: number;
}

/** The constraints a box is laid out in. */
export interface Space {
	/** Inline space available for the margin box (the containing block's content width), px. */
	available: number;
	/** Border-box width set by the parent (stretched, flexed, a grid area, a table column). */
	width?: number;
	/** Border-box height set by the parent. */
	height?: number;
	/** What percentage widths / heights resolve against (absent: indefinite). */
	pctW?: number;
	pctH?: number;
	/** An auto width shrinks to fit (fit-content) instead of filling the available space. */
	shrink?: boolean;
	/** Border widths to use instead of the box's own (a cell in a collapsed-border table). */
	borders?: Sides;
}

/** A laid-out box: its border-box size and its children, positioned in it. */
export interface Fragment {
	box: ElementBox | TextRun;
	w: number;
	h: number;
	kids: Placed[];
	/** A text run's lines, laid out at `w`. */
	lines?: LineBreakResult;
	/** Effective block margins after collapsing through this box (for its parent). */
	mt: number;
	mb: number;
	/** Absolutely positioned descendants waiting for their containing block (offsets in this box). */
	pending: Placed[];
	/** A table: its column widths. */
	columns?: number[];
}

export interface Placed {
	f: Fragment;
	x: number;
	y: number;
}

export class Flow {
	private readonly cache = new Map<ElementBox | TextRun, Map<string, Fragment>>();
	private readonly contributions = new Map<ElementBox, Sizes>();
	private readonly contents = new Map<ElementBox | TextRun, Sizes>();

	constructor(readonly ctx: StyleContext) {}

	// ── Values ───────────────────────────────────────────────────────────

	/** A track size or other bare length in `style`'s context (percentages against `basis`). */
	lengthIn(style: Computed, basis: number | undefined): (v: string) => number {
		return (v) => this.ctx.lengthIn(style, v, basis ?? Number.NaN);
	}

	private positioned(style: Computed): boolean {
		return isPositioned(style);
	}

	absolute(box: ElementBox | TextRun): boolean {
		return box.type === "element" && isAbsolute(box.style);
	}

	/**
	 * A picture's own size: its width / height attributes, else (an image)
	 * the file's natural size; its ratio from those, or an SVG's viewBox.
	 */
	natural(box: ElementBox): { w?: number; h?: number; ratio?: number } {
		const px = (v: string | undefined) =>
			v && /^[\d.]+(px)?$/.test(v.trim()) ? Number.parseFloat(v) : undefined;
		let w = px(box.el.attribs.width);
		let h = px(box.el.attribs.height);
		let fileRatio: number | undefined;
		if (box.el.name === "img" && box.el.attribs.src && (w === undefined || h === undefined)) {
			const file = this.ctx.images?.(box.el.attribs.src);
			if (file && file.w > 0 && file.h > 0) {
				fileRatio = file.w / file.h;
				if (w === undefined && h === undefined) {
					w = file.w;
					h = file.h;
				} else if (w === undefined && h !== undefined) w = h * fileRatio;
				else if (h === undefined && w !== undefined) h = w / fileRatio;
			}
		}
		const view = (box.el.attribs.viewBox ?? box.el.attribs.viewbox ?? "")
			.trim()
			.split(/[\s,]+/)
			.map(Number);
		const ratio =
			w && h
				? w / h
				: (fileRatio ??
					((view[2] ?? 0) > 0 && (view[3] ?? 0) > 0 ? (view[2] ?? 1) / (view[3] ?? 1) : undefined));
		const zoom = Number(box.style.get("__zoom") ?? 1) || 1;
		return {
			...(w !== undefined ? { w: w * zoom } : {}),
			...(h !== undefined ? { h: h * zoom } : {}),
			...(ratio !== undefined ? { ratio } : {}),
		};
	}

	/**
	 * A replaced box's border-box size when its width and height are both
	 * auto (CSS 2 §10.4); undefined for an image whose size isn't known.
	 */
	private replacedAuto(box: ElementBox, bm: BoxModel): { w: number; h: number } | undefined {
		const nat = this.natural(box);
		const img = box.el.name === "img";
		if (img && nat.w === undefined && nat.h === undefined && !nat.ratio) return undefined;
		const r = replacedSize(
			bm,
			nat,
			bm.ratio || nat.ratio,
			img ? { w: 0, h: 0 } : { w: 300, h: 150 },
		);
		return { w: r.w + bm.inset.x, h: r.h + bm.inset.y };
	}

	// ── Intrinsic sizes ──────────────────────────────────────────────────

	/**
	 * A box's min-content and max-content contributions (css-sizing-3 §5.2):
	 * its margin-box width from its set width, or else its content's sizes,
	 * within min / max-width. Percentage sizes count as auto (§5.2.1).
	 */
	contribution(box: ElementBox | TextRun): Sizes {
		if (box.type === "text") return this.contentSizes(box);
		const hit = this.contributions.get(box);
		if (hit) return hit;
		const { style } = box;
		// Intrinsic: percentages count as auto (css-sizing-3 §5.2.1).
		const bm = boxModel(this.ctx, style);
		let own: Sizes;
		if (bm.width !== undefined) own = { min: bm.width, max: bm.width };
		else if (box.kind === "replaced") {
			const nat = this.natural(box);
			const ratio = bm.ratio || nat.ratio;
			const w =
				bm.height !== undefined && ratio
					? contentHeight(bm, bm.height) * ratio + bm.inset.x
					: (this.replacedAuto(box, bm)?.w ?? bm.inset.x);
			// A percentage width makes a picture compressible: no min-content (§5.2.1).
			const pct = value(style, "width").endsWith("%");
			own = { min: pct ? 0 : w, max: w };
		} else {
			const c = this.contentSizes(box);
			own = { min: c.min + bm.inset.x, max: c.max + bm.inset.x };
		}
		const out = {
			min: outerWidth(bm, clampWidth(bm, own.min)),
			max: outerWidth(bm, clampWidth(bm, own.max)),
		};
		this.contributions.set(box, out);
		return out;
	}

	/**
	 * The min-content and max-content widths of a box's content: what its
	 * text or children need, laid out the way the box lays them out — its
	 * content box, whatever the box's own width says (css-sizing-3 §5.1).
	 * The content size suggestion of a flex item and a table cell's minimum
	 * come from here, not from the contribution.
	 */
	contentSizes(box: ElementBox | TextRun): Sizes {
		const hit = this.contents.get(box);
		if (hit) return hit;
		const out = box.type === "text" ? textSizes(this, box) : this.childSizes(box);
		this.contents.set(box, out);
		return out;
	}

	/** The children's sizes, combined the way the box's formatting context places them. */
	private childSizes(box: ElementBox): Sizes {
		switch (box.kind) {
			case "flex":
				return flexSizes(this, box);
			case "grid":
				return gridSizes(this, box);
			case "table":
				return tableSizes(this, box);
			default:
				return blockSizes(this, box);
		}
	}

	// ── Layout ───────────────────────────────────────────────────────────

	layout(box: ElementBox | TextRun, space: Space): Fragment {
		const key = JSON.stringify(space);
		let byKey = this.cache.get(box);
		const hit = byKey?.get(key);
		if (hit) return hit;
		const f = box.type === "text" ? layoutText(this, box, space) : this.element(box, space);
		if (!byKey) {
			byKey = new Map();
			this.cache.set(box, byKey);
		}
		byKey.set(key, f);
		return f;
	}

	/** A fragment's first (or last) baseline, from its top; undefined when it has no line. */
	baseline(f: Fragment, last: boolean): number | undefined {
		if (f.lines) {
			const b = f.lines.baselines;
			if (b.length) return last ? b[b.length - 1] : b[0];
		}
		if (f.box.type === "element" && f.box.kind === "replaced") return undefined;
		if (f.box.type === "element" && f.box.kind === "table") {
			const row = last ? f.kids[f.kids.length - 1] : f.kids[0];
			const b = row && rowBaseline(this, row.f);
			return b === undefined || !row ? undefined : row.y + b;
		}
		const kids = last ? [...f.kids].reverse() : f.kids;
		for (const k of kids) {
			if (this.absolute(k.f.box)) continue;
			const b = this.baseline(k.f, last);
			if (b !== undefined) return k.y + b;
		}
		return undefined;
	}

	/** The border-box width a box gets in `space`. */
	private usedWidth(box: ElementBox, space: Space, bm: BoxModel): number {
		const { style } = box;
		if (space.width !== undefined) return space.width;
		let w = bm.width;
		const sizeKeyword = value(style, "width");
		const fitContent = /^(fit-content|max-content|min-content)$/.test(sizeKeyword);
		if (w === undefined && box.kind === "replaced") {
			// CSS 2 §10.3.2: a set height and a ratio give the width; else §10.4's table.
			const nat = this.natural(box);
			const ratio = bm.ratio || nat.ratio;
			if (bm.height !== undefined && ratio) w = contentHeight(bm, bm.height) * ratio + bm.inset.x;
			else w = this.replacedAuto(box, bm)?.w;
		}
		if (w === undefined && bm.ratio && bm.height !== undefined)
			w = contentHeight(bm, bm.height) * bm.ratio + bm.inset.x;
		if (w === undefined) {
			const mx = bm.margin.left + bm.margin.right;
			const avail = Math.max(0, space.available - mx);
			if (space.shrink || fitContent) {
				const c = this.contribution(box);
				w =
					sizeKeyword === "max-content"
						? c.max - mx
						: sizeKeyword === "min-content"
							? c.min - mx
							: Math.min(c.max - mx, Math.max(c.min - mx, avail));
			} else w = avail;
		}
		return clampWidth(bm, w);
	}

	/** The border-box height: set by the parent, specified, from the aspect ratio, or from the content. */
	private usedHeight(
		box: ElementBox,
		space: Space,
		bm: BoxModel,
		w: number,
		content: number,
	): number {
		let h = space.height ?? bm.height;
		// Both auto: §10.4's table gave the width and gives the height with it.
		if (
			h === undefined &&
			box.kind === "replaced" &&
			space.width === undefined &&
			bm.width === undefined
		)
			h = this.replacedAuto(box, bm)?.h;
		if (h === undefined) {
			const ratio = bm.ratio || (box.kind === "replaced" ? this.natural(box).ratio : undefined);
			if (ratio) h = contentWidth(bm, w) / ratio + bm.inset.y;
			else if (box.kind === "replaced") h = (this.natural(box).h ?? 150) + bm.inset.y;
		}
		h ??= content + bm.inset.y;
		if (space.height !== undefined) return h;
		return clampHeight(bm, h);
	}

	private element(box: ElementBox, space: Space): Fragment {
		const { style } = box;
		const bm = boxModel(this.ctx, style, { width: space.pctW, height: space.pctH }, space.borders);
		const { padding, border, margin: m } = bm;
		const w = this.usedWidth(box, space, bm);
		const cw = contentWidth(bm, w);
		// The content height when it's known before laying out the content.
		const definiteH =
			space.height ??
			bm.height ??
			(bm.ratio ? contentWidth(bm, w) / bm.ratio + bm.inset.y : undefined);
		const ch = definiteH === undefined ? undefined : contentHeight(bm, definiteH);
		const origin = { x: border.left + padding.left, y: border.top + padding.top };

		let content: {
			kids: Placed[];
			height: number;
			mt: number;
			mb: number;
			pending: Placed[];
			columns?: number[];
		};
		switch (box.kind) {
			case "replaced":
				content = { kids: [], height: 0, mt: m.top, mb: m.bottom, pending: [] };
				break;
			case "flex":
				content = { ...layoutFlex(this, box, cw, ch), mt: m.top, mb: m.bottom };
				break;
			case "grid":
				content = { ...layoutGrid(this, box, cw, ch), mt: m.top, mb: m.bottom };
				break;
			case "table":
				content = { ...layoutTable(this, box, cw), mt: m.top, mb: m.bottom };
				break;
			default:
				content = layoutBlock(
					this,
					box,
					cw,
					ch,
					m,
					padding,
					border,
					space.height !== undefined || definiteH !== undefined,
				);
		}
		const h = this.usedHeight(box, space, bm, w, content.height);
		for (const k of content.kids) {
			k.x += origin.x;
			k.y += origin.y;
		}
		// Table cells (and anything given a height taller than its content) align their content.
		const va = value(style, "vertical-align");
		if (keyword(style, "display") === "table-cell" && content.height + bm.inset.y < h) {
			const free = h - bm.inset.y - content.height;
			const shift = va === "top" ? 0 : va === "bottom" ? free : free / 2;
			for (const k of content.kids) k.y += shift;
		}
		let pending = content.pending.map((p) => ({ ...p, x: p.x + origin.x, y: p.y + origin.y }));
		const f: Fragment = {
			box,
			w,
			h,
			kids: content.kids,
			mt: content.mt,
			mb: content.mb,
			pending: [],
			...(content.columns ? { columns: content.columns } : {}),
		};
		// A positioned box is the containing block of the absolutely positioned boxes inside it.
		if (this.positioned(style)) {
			for (const p of pending) f.kids.push(this.placeAbsolute(p, f, border));
			pending = [];
		}
		f.pending = pending;
		return f;
	}

	/** Place an absolutely positioned box against `cb`'s padding box (its static position where insets are auto). */
	placeAbsolute(p: Placed, cb: Fragment, border: Sides): Placed {
		const box = p.f.box as ElementBox;
		const { style } = box;
		const pw = cb.w - border.left - border.right;
		const ph = cb.h - border.top - border.bottom;
		const inset = (s: (typeof SIDES)[number], basis: number) => lengthOf(this.ctx, style, s, basis);
		const left = inset("left", pw);
		const right = inset("right", pw);
		const top = inset("top", ph);
		const bottom = inset("bottom", ph);
		const m = marginsOf(this.ctx, style, pw);
		const stretchW = left !== undefined && right !== undefined && isAuto(style, "width");
		const stretchH = top !== undefined && bottom !== undefined && isAuto(style, "height");
		const f = this.layout(box, {
			available: pw,
			pctW: pw,
			pctH: ph,
			shrink: true,
			...(stretchW
				? { width: Math.max(0, pw - (left ?? 0) - (right ?? 0) - m.left - m.right) }
				: {}),
			...(stretchH
				? { height: Math.max(0, ph - (top ?? 0) - (bottom ?? 0) - m.top - m.bottom) }
				: {}),
		});
		const x =
			left !== undefined
				? border.left + left + m.left
				: right !== undefined
					? border.left + pw - right - m.right - f.w
					: p.x;
		const y =
			top !== undefined
				? border.top + top + m.top
				: bottom !== undefined
					? border.top + ph - bottom - m.bottom - f.h
					: p.y;
		return { f, x, y };
	}

	/** `position: relative` offsets (they move the box, not its neighbours). */
	relative(style: Computed, pctW: number, pctH: number | undefined): { dx: number; dy: number } {
		if (!/^(relative|sticky)$/.test(keyword(style, "position"))) return { dx: 0, dy: 0 };
		const left = lengthOf(this.ctx, style, "left", pctW);
		const right = lengthOf(this.ctx, style, "right", pctW);
		const top = lengthOf(this.ctx, style, "top", pctH);
		const bottom = lengthOf(this.ctx, style, "bottom", pctH);
		return {
			dx: left ?? (right !== undefined ? -right : 0),
			dy: top ?? (bottom !== undefined ? -bottom : 0),
		};
	}
}
