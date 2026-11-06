/**
 * Layout as a function of constraints (#357): `layout(box, space)` lays out a
 * box of the box tree (box-tree.ts) in a constraint space and returns a
 * fragment — its size and its children's positions — without carrying state
 * from one call to the next. Intrinsic sizes (min-content / max-content
 * contributions, css-sizing-3 §5) are computed from the content, without
 * regard to the context; heights come from laying content out at a width.
 *
 * - block flow: CSS 2 §10.3.3 / §10.6.3, margin collapsing §8.3.1
 * - flex: css-flexbox-1 §9 (flexible lengths §9.7, automatic minimum size
 *   §4.5), items measured and laid out by `layout()`
 * - grid: css-grid-1 §11 (columns from contributions, then rows from items
 *   laid out in their columns; rows grow and may overflow the container)
 * - tables: automatic table layout from cells' min / max-content widths
 * - absolutely positioned boxes: against the nearest positioned ancestor
 */

import {
	alongAxes,
	aspectRatio,
	type BoxModel,
	boxModel,
	clampHeight,
	clampWidth,
	contentHeight,
	contentWidth,
	edgesOf,
	lengthOf,
	marginsOf,
	outerWidth,
	type SIDES,
	type Sides,
	setSize,
} from "./box-model";
import type { ElementBox, StyleContext, TextRun } from "./box-tree";
import type { Computed } from "./cascade";
import { columnSpan, columnTracks, parseTracks, placeItems, sizeTracks } from "./grid";
import {
	clipsOverflow,
	isAbsolute,
	isAuto,
	isFloat,
	isPositioned,
	keyword,
	value,
} from "./properties";
import {
	type AtomicInline,
	type InlineItem,
	type InlineStyle,
	type LineBreakResult,
	layoutLines,
	verticalMetrics,
} from "./text";

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

/** Margins collapse: the largest positive plus the most negative (CSS 2 §8.3.1). */
const join = (a: number, b: number) => Math.max(a, b, 0) + Math.min(a, b, 0);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export class Flow {
	private readonly cache = new Map<ElementBox | TextRun, Map<string, Fragment>>();
	private readonly contributions = new Map<ElementBox | TextRun, { min: number; max: number }>();

	constructor(readonly ctx: StyleContext) {}

	// ── Values ───────────────────────────────────────────────────────────

	/** A grid's column tracks (template and implicit ones), percentages against `basis`. */
	private columnTracks(
		style: Computed,
		basis: number | undefined,
		inner: number,
		gap: number,
		items: number,
	) {
		return columnTracks(
			value(style, "grid-template-columns"),
			value(style, "grid-auto-flow"),
			value(style, "grid-auto-columns"),
			this.lengthIn(style, basis),
			inner,
			gap,
			items,
		);
	}

	/** A track size or other bare length in `style`'s context (percentages against `basis`). */
	private lengthIn(style: Computed, basis: number | undefined): (v: string) => number {
		return (v) => this.ctx.lengthIn(style, v, basis ?? Number.NaN);
	}

	private positioned(style: Computed): boolean {
		return isPositioned(style);
	}

	private absolute(box: ElementBox | TextRun): boolean {
		return box.type === "element" && isAbsolute(box.style);
	}

	/**
	 * A picture's own size: its width / height attributes, else (an image)
	 * the file's natural size; its ratio from those, or an SVG's viewBox.
	 */
	private natural(box: ElementBox): { w?: number; h?: number; ratio?: number } {
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

	// ── Intrinsic sizes ──────────────────────────────────────────────────

	/**
	 * A box's min-content and max-content contributions: its outer (margin
	 * box) width when its containing block is zero / infinitely wide
	 * (css-sizing-3 §5.2). Percentage sizes count as auto (§5.2.1).
	 */
	contribution(box: ElementBox | TextRun): { min: number; max: number } {
		const hit = this.contributions.get(box);
		if (hit) return hit;
		let out: { min: number; max: number };
		if (box.type === "text") {
			// An atomic inline counts with its own contribution.
			const sized = (key: "min" | "max") =>
				box.items.map((it) =>
					it.kind === "atomic"
						? { ...it, width: this.contribution(it.box as ElementBox)[key] }
						: it,
				);
			out = {
				min: layoutLines(sized("min"), 0, box.strut, "left", this.ctx.fonts, box.indent).width,
				max: layoutLines(
					sized("max"),
					Number.POSITIVE_INFINITY,
					box.strut,
					"left",
					this.ctx.fonts,
					box.indent,
				).width,
			};
		} else {
			const { style } = box;
			// Intrinsic: percentages count as auto (css-sizing-3 §5.2.1).
			const bm = boxModel(this.ctx, style);
			let inner: { min: number; max: number };
			if (bm.width !== undefined) inner = { min: bm.width, max: bm.width };
			else if (box.kind === "replaced") {
				const nat = this.natural(box);
				const h = bm.height;
				let w =
					nat.w ?? (h !== undefined && nat.ratio ? h * nat.ratio : box.el.name === "img" ? 0 : 300);
				// Height limits carry over through the ratio (CSS 2 §10.4).
				const ratio = bm.ratio || nat.ratio;
				if (ratio && h === undefined) {
					if (bm.max.height < Number.POSITIVE_INFINITY)
						w = Math.min(w, contentHeight(bm, bm.max.height) * ratio);
					if (bm.min.height > 0) w = Math.max(w, contentHeight(bm, bm.min.height) * ratio);
				}
				// A percentage width makes a picture compressible: no min-content (§5.2.1).
				const pct = value(style, "width").endsWith("%");
				inner = { min: pct ? 0 : w + bm.inset.x, max: w + bm.inset.x };
			} else {
				const c = this.contentContribution(box);
				inner = { min: c.min + bm.inset.x, max: c.max + bm.inset.x };
			}
			out = {
				min: outerWidth(bm, clampWidth(bm, inner.min)),
				max: outerWidth(bm, clampWidth(bm, inner.max)),
			};
		}
		this.contributions.set(box, out);
		return out;
	}

	/** The content's contributions by how the box lays out its children. */
	private contentContribution(box: ElementBox): { min: number; max: number } {
		const kids = box.children.filter((c) => !this.absolute(c));
		const each = kids.map((k) => this.contribution(k));
		const largest = (key: "min" | "max") => Math.max(0, ...each.map((c) => c[key]));
		if (box.kind === "flex") {
			const row = !keyword(box.style, "flex-direction").startsWith("column");
			if (!row) return { min: largest("min"), max: largest("max") };
			const gap = (lengthOf(this.ctx, box.style, "column-gap") ?? 0) * Math.max(0, kids.length - 1);
			const wrap = keyword(box.style, "flex-wrap") !== "nowrap";
			return {
				min: wrap ? largest("min") : sum(each.map((c) => c.min)) + gap,
				max: sum(each.map((c) => c.max)) + gap,
			};
		}
		if (box.kind === "grid") {
			const gap = lengthOf(this.ctx, box.style, "column-gap") ?? 0;
			const tracks = this.columnTracks(box.style, undefined, 0, gap, kids.length);
			const n = Math.max(1, tracks.length);
			const placed = placeItems(
				kids.map((k) => (k.type === "element" ? columnSpan(value(k.style, "grid-column"), n) : 1)),
				n,
			);
			const per = (key: "min" | "max") => {
				const cols = Array<number>(n).fill(0);
				for (const [i, p] of placed.entries()) {
					const c = each[i];
					if (c && p.span === 1) cols[p.col] = Math.max(cols[p.col] ?? 0, c[key]);
				}
				return sum(cols) + gap * (n - 1);
			};
			return { min: per("min"), max: per("max") };
		}
		if (box.kind === "table") {
			const { min, max } = this.tableColumns(box);
			return { min: sum(min), max: sum(max) };
		}
		return { min: largest("min"), max: largest("max") };
	}

	// ── Layout ───────────────────────────────────────────────────────────

	layout(box: ElementBox | TextRun, space: Space): Fragment {
		const key = JSON.stringify(space);
		let byKey = this.cache.get(box);
		const hit = byKey?.get(key);
		if (hit) return hit;
		const f = box.type === "text" ? this.text(box, space) : this.element(box, space);
		if (!byKey) {
			byKey = new Map();
			this.cache.set(box, byKey);
		}
		byKey.set(key, f);
		return f;
	}

	private text(run: TextRun, space: Space): Fragment {
		const c = this.contribution(run);
		const w =
			space.width ??
			(space.shrink ? Math.min(c.max, Math.max(c.min, space.available)) : space.available);
		// Atomic inlines: laid out first (shrink-to-fit in the line's width), then placed by the lines.
		const laid = new Map<AtomicInline, { f: Fragment; m: Sides }>();
		const items: InlineItem[] = run.items.map((it) => {
			if (it.kind !== "atomic") return it;
			const box = it.box as ElementBox;
			const f = this.layout(box, { available: w, pctW: w, shrink: true });
			const m = marginsOf(this.ctx, box.style, w);
			const height = f.h + m.top + m.bottom;
			const sized: AtomicInline = {
				...it,
				width: f.w + m.left + m.right,
				height,
				baseline: this.verticalAlign(box, m.top + this.inlineBaseline(box, f), height, run.strut),
			};
			laid.set(sized, { f, m });
			return sized;
		});
		const lines = layoutLines(items, w, run.strut, run.align, this.ctx.fonts, run.indent);
		const kids: Placed[] = [];
		const pending: Placed[] = [];
		for (const a of lines.atomics) {
			const at = laid.get(a.item);
			if (!at) continue;
			const x = a.x + at.m.left;
			const y = a.y + at.m.top;
			kids.push({ f: at.f, x, y });
			for (const p of at.f.pending) pending.push({ ...p, x: p.x + x, y: p.y + y });
		}
		return { box: run, w, h: lines.height, kids, lines, mt: 0, mb: 0, pending };
	}

	/**
	 * Where an atomic inline's baseline is, from its border-box top: an
	 * inline-block's last line box (its bottom margin edge when it has none
	 * or clips its overflow, CSS 2 §10.8.1); an inline flex / grid / table
	 * box's first baseline, else its border-box bottom (css-align-3 §9).
	 */
	private inlineBaseline(box: ElementBox, f: Fragment): number {
		const last = box.kind === "block";
		const clips = clipsOverflow(box.style);
		const m = marginsOf(this.ctx, box.style);
		const own = last && clips ? undefined : this.baseline(f, last);
		return own ?? (last ? f.h + m.bottom : f.h);
	}

	/**
	 * A table row's baseline: its first baseline-aligned cell's, else the
	 * bottom of the lowest cell's content box (CSS 2 §17.5.3).
	 */
	private rowBaseline(row: Fragment): number | undefined {
		let low: number | undefined;
		for (const c of row.kids) {
			if (c.f.box.type !== "element") continue;
			const { style } = c.f.box;
			if (value(style, "vertical-align") === "baseline") {
				const b = this.baseline(c.f, false);
				if (b !== undefined) return c.y + b;
			}
			const { padding, border } = edgesOf(this.ctx, style, row.w);
			low = Math.max(low ?? 0, c.y + c.f.h - padding.bottom - border.bottom);
		}
		return low;
	}

	/**
	 * Where the line's baseline crosses an atomic inline of `height` whose
	 * own baseline is at `baseline` (from its margin-box top), by its
	 * `vertical-align` against the parent's font (CSS 2 §10.8.1). `top` /
	 * `bottom` align as `baseline`.
	 */
	private verticalAlign(
		box: ElementBox,
		baseline: number,
		height: number,
		parent: InlineStyle,
	): number {
		const va = value(box.style, "vertical-align");
		const m = verticalMetrics(parent.face, parent.size);
		switch (va) {
			case "middle": {
				const f = parent.face.font;
				const xHeight = ((f.xHeight || f.unitsPerEm / 2) / f.unitsPerEm) * parent.size;
				return height / 2 + xHeight / 2;
			}
			case "text-top":
				return m.ascent;
			case "text-bottom":
				return height - m.descent;
			// Chromium's shifts: a fifth of the font size down, a third up (plus 1px).
			case "sub":
				return baseline - (parent.size / 5 + 1);
			case "super":
				return baseline + parent.size / 3 + 1;
		}
		// A length or a percentage of its line-height raises it.
		const own = this.ctx.inlineStyle(box.style).lineHeight;
		const shift = this.ctx.lengthIn(box.style, va, own);
		return Number.isNaN(shift) ? baseline : baseline + shift;
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
			const b = row && this.rowBaseline(row.f);
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
			// CSS 2 §10.3.2: a set height and a ratio give the width; else the natural width.
			const nat = this.natural(box);
			const ratio = bm.ratio || nat.ratio;
			if (bm.height !== undefined && ratio) w = contentHeight(bm, bm.height) * ratio + bm.inset.x;
			else if (nat.w !== undefined) w = nat.w + bm.inset.x;
			else if (box.el.name !== "img") w = 300 + bm.inset.x;
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
				content = { ...this.flex(box, cw, ch), mt: m.top, mb: m.bottom };
				break;
			case "grid":
				content = { ...this.grid(box, cw, ch), mt: m.top, mb: m.bottom };
				break;
			case "table":
				content = { ...this.table(box, cw), mt: m.top, mb: m.bottom };
				break;
			default:
				content = this.block(
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
	private relative(
		style: Computed,
		pctW: number,
		pctH: number | undefined,
	): { dx: number; dy: number } {
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

	// ── Block flow ───────────────────────────────────────────────────────

	private block(
		box: ElementBox,
		cw: number,
		ch: number | undefined,
		m: Sides,
		padding: Sides,
		border: Sides,
		fixedHeight: boolean,
	): { kids: Placed[]; height: number; mt: number; mb: number; pending: Placed[] } {
		const kids: Placed[] = [];
		const pending: Placed[] = [];
		let y = 0;
		/** The bottom margin of the last block, not yet added (it may collapse with the next). */
		let carried: number | null = null;
		let mt = m.top;
		let mb = m.bottom;
		const throughTop = !box.bfcRoot && padding.top + border.top === 0;
		const throughBottom = !box.bfcRoot && padding.bottom + border.bottom === 0 && !fixedHeight;
		let first = true;
		for (const child of box.children) {
			if (this.absolute(child)) {
				// Its static position: where it would start in flow.
				pending.push({
					f: this.layout(child, { available: cw, pctW: cw, pctH: ch, shrink: true }),
					x: 0,
					y: y + (carried ?? 0),
				});
				continue;
			}
			if (child.type === "text") {
				y += carried ?? 0;
				carried = null;
				const f = this.layout(child, { available: cw, width: cw, pctW: cw, pctH: ch });
				kids.push({ f, x: 0, y });
				y += f.h;
				first = false;
				continue;
			}
			const cs = child.style;
			const shrink = isFloat(cs);
			const f = this.layout(child, { available: cw, pctW: cw, pctH: ch, shrink });
			const cm = marginsOf(this.ctx, cs, cw);
			let x = cm.left;
			const free = cw - f.w - cm.left - cm.right;
			if (isAuto(cs, "margin-left") && isAuto(cs, "margin-right")) x = Math.max(0, free) / 2;
			else if (isAuto(cs, "margin-left")) x = Math.max(0, free) + cm.left;
			if (first && throughTop) {
				// The first child's top margin collapses with this box's.
				mt = join(mt, f.mt);
			} else y += join(carried ?? 0, f.mt);
			carried = null;
			const { dx, dy } = this.relative(cs, cw, ch);
			kids.push({ f, x: x + dx, y: y + dy });
			for (const p of f.pending) pending.push({ ...p, x: p.x + x + dx, y: p.y + y + dy });
			y += f.h;
			carried = f.mb;
			first = false;
		}
		if (carried !== null) {
			if (throughBottom && !first) mb = join(mb, carried);
			else y += carried;
		}
		return { kids, height: y, mt, mb, pending };
	}

	// ── Flex ─────────────────────────────────────────────────────────────

	/**
	 * A flex container's content, by css-flexbox-1 §9: flex base sizes and
	 * hypothetical main sizes (§9.2), lines (§9.3), flexible lengths (§9.7),
	 * cross sizes and stretching (§9.4), main- and cross-axis alignment
	 * (§9.5, §9.6). Items are measured and laid out with `layout()`; a
	 * flexed or stretched size is definite for the item's children (§9.8).
	 */
	private flex(
		box: ElementBox,
		cw: number,
		ch: number | undefined,
	): { kids: Placed[]; height: number; pending: Placed[] } {
		const { style } = box;
		const dir = keyword(style, "flex-direction");
		const column = dir.startsWith("column");
		const reverse = dir.endsWith("-reverse");
		const wrapValue = keyword(style, "flex-wrap");
		const wrap = wrapValue !== "nowrap";
		const mainGap =
			(column
				? lengthOf(this.ctx, style, "row-gap", ch)
				: lengthOf(this.ctx, style, "column-gap", cw)) ?? 0;
		const crossGap =
			(column
				? lengthOf(this.ctx, style, "column-gap", cw)
				: lengthOf(this.ctx, style, "row-gap", ch)) ?? 0;
		const mainSize = column ? ch : cw;
		const crossSize = column ? cw : ch;
		const alignItems = value(style, "align-items");

		const pending: Placed[] = [];
		const items: FlexItem[] = [];
		for (const child of box.children) {
			if (this.absolute(child)) {
				pending.push({
					f: this.layout(child, { available: cw, pctW: cw, pctH: ch, shrink: true }),
					x: 0,
					y: 0,
				});
				continue;
			}
			items.push(this.flexItem(child, column, cw, ch, alignItems));
		}

		// Lines (§9.3): a single line unless wrapping into a definite main size.
		const lines: FlexItem[][] = [];
		if (!wrap || mainSize === undefined) lines.push(items);
		else {
			let line: FlexItem[] = [];
			let used = 0;
			for (const it of items) {
				const outer = it.hypo + it.mainMargins;
				if (line.length > 0 && used + mainGap + outer > mainSize + 0.01) {
					lines.push(line);
					line = [];
					used = 0;
				}
				used += (line.length > 0 ? mainGap : 0) + outer;
				line.push(it);
			}
			if (line.length > 0) lines.push(line);
		}

		// Flexible lengths (§9.7), then each item's cross size at its main size (§9.4).
		let contentMain = 0;
		for (const line of lines) {
			const gaps = mainGap * Math.max(0, line.length - 1);
			const avail = mainSize ?? sum(line.map((it) => it.hypo + it.mainMargins)) + gaps;
			resolveFlexibleLengths(line, avail, gaps);
			contentMain = Math.max(contentMain, sum(line.map((it) => it.target + it.mainMargins)) + gaps);
			// Cross sizes within the item's min / max (min-width / max-width in a column).
			for (const it of line)
				it.cross = Math.max(
					it.crossMin,
					Math.min(it.crossMax, this.flexCross(it, column, cw, ch, crossSize)),
				);
		}
		const lineCross = lines.map((line) =>
			Math.max(0, ...line.map((it) => (it.cross ?? 0) + it.crossMargins)),
		);
		// A single line in a definite cross size takes all of it.
		if (lines.length === 1 && crossSize !== undefined) lineCross[0] = crossSize;
		else if (crossSize !== undefined && lines.length > 1) {
			const ac = value(style, "align-content");
			const free = crossSize - sum(lineCross) - crossGap * (lines.length - 1);
			if (free > 0 && /^(normal|stretch)$/.test(ac))
				for (let i = 0; i < lineCross.length; i++)
					lineCross[i] = (lineCross[i] ?? 0) + free / lines.length;
		}

		const kids: Placed[] = [];
		const lineOrder =
			wrapValue === "wrap-reverse" ? [...lines.keys()].reverse() : [...lines.keys()];
		let crossAt = 0;
		const justify = value(style, "justify-content");
		for (const li of lineOrder) {
			const line = lines[li] ?? [];
			const stretchTo = lineCross[li] ?? 0;
			const avail = mainSize ?? contentMain;
			// Stretched items (§9.4 step 11) and the final layout of every item.
			for (const it of line) {
				if (it.stretch)
					it.cross = Math.max(it.crossMin, Math.min(it.crossMax, stretchTo - it.crossMargins));
				const w = column ? (it.cross ?? 0) : it.target;
				const h = column ? it.target : (it.cross ?? 0);
				it.f = this.layout(it.box, {
					available: w,
					width: w,
					...(column || it.stretch || it.definiteCross ? { height: h } : {}),
					pctW: cw,
					...(ch !== undefined ? { pctH: ch } : {}),
				});
				if (!column && !it.stretch && !it.definiteCross) it.cross = it.f.h;
			}
			// Baseline alignment in a row (§8.5): the items' first baselines line up,
			// at the deepest one; the line holds what's above and below it.
			const baselineOf = new Map<FlexItem, number>();
			if (!column)
				for (const it of line) {
					if (!/baseline/.test(it.align) || it.autoCrossStart || it.autoCrossEnd) continue;
					const f = it.f as Fragment;
					baselineOf.set(it, it.crossStart + (this.baseline(f, false) ?? f.h));
				}
			let lineBaseline = 0;
			if (baselineOf.size > 0) {
				lineBaseline = Math.max(...baselineOf.values());
				const below = Math.max(
					...[...baselineOf].map(([it, b]) => (it.cross ?? 0) + it.crossMargins - b),
				);
				if (!(lines.length === 1 && crossSize !== undefined))
					lineCross[li] = Math.max(lineCross[li] ?? 0, lineBaseline + below);
			}
			const lc = lineCross[li] ?? 0;
			// Main axis (§9.5): auto margins take free space first, then justify-content.
			const gaps = mainGap * Math.max(0, line.length - 1);
			let free = avail - sum(line.map((it) => it.target + it.mainMargins)) - gaps;
			const autos = sum(line.map((it) => (it.autoMainStart ? 1 : 0) + (it.autoMainEnd ? 1 : 0)));
			let start = 0;
			let between = mainGap;
			if (autos > 0 && free > 0) {
				const each = free / autos;
				for (const it of line) {
					if (it.autoMainStart) it.mainStart += each;
					if (it.autoMainEnd) it.mainEnd += each;
				}
				free = 0;
			} else if (/^(center)$/.test(justify)) start = free / 2;
			else if (/^(flex-end|end|right)$/.test(justify) !== reverse) start = free;
			else if (justify === "space-between" && line.length > 1 && free > 0)
				between += free / (line.length - 1);
			else if (justify === "space-around" && free > 0) {
				start = free / line.length / 2;
				between += free / line.length;
			} else if (justify === "space-evenly" && free > 0) {
				start = free / (line.length + 1);
				between += free / (line.length + 1);
			} else if (/^(space-around|space-evenly)$/.test(justify) && free < 0) start = free / 2;
			const ordered = reverse ? [...line].reverse() : line;
			let mainAt =
				reverse &&
				!/^(center|space-between|space-around|space-evenly)$/.test(justify) &&
				!/^(flex-end|end|right)$/.test(justify)
					? free
					: start;
			if (reverse && /^(flex-end|end|right)$/.test(justify)) mainAt = 0;
			for (const it of ordered) {
				const main = mainAt + it.mainStart;
				// Cross axis (§9.6): auto margins, then align-self.
				const outerCross = (it.cross ?? 0) + it.crossMargins;
				let cross = it.crossStart;
				const freeCross = lc - outerCross;
				if (it.autoCrossStart && it.autoCrossEnd) cross += Math.max(0, freeCross) / 2;
				else if (it.autoCrossStart) cross += Math.max(0, freeCross);
				else if (baselineOf.has(it))
					cross = it.crossStart + lineBaseline - (baselineOf.get(it) ?? 0);
				else if (!it.autoCrossEnd) {
					if (it.align === "center") cross += freeCross / 2;
					else if (/^(flex-end|end|self-end)$/.test(it.align) !== (wrapValue === "wrap-reverse"))
						cross += freeCross;
				}
				const f = it.f as Fragment;
				let x = column ? crossAt + cross : main;
				let y = column ? main : crossAt + cross;
				if (it.box.type === "element") {
					const { dx, dy } = this.relative(it.box.style, cw, ch);
					x += dx;
					y += dy;
				}
				kids.push({ f, x, y });
				for (const p of f.pending) pending.push({ ...p, x: p.x + x, y: p.y + y });
				mainAt = main + it.target + it.mainEnd + between;
			}
			crossAt += lc + crossGap;
		}
		const crossTotal = sum(lineCross) + crossGap * Math.max(0, lines.length - 1);
		return { kids, height: column ? (ch ?? contentMain) : (ch ?? crossTotal), pending };
	}

	/** A flex item's flex base size, hypothetical main size and limits (§9.2, §4.5). */
	private flexItem(
		item: ElementBox | TextRun,
		column: boolean,
		cw: number,
		ch: number | undefined,
		alignItems: string,
	): FlexItem {
		const base: FlexItem = {
			box: item,
			grow: 0,
			shrink: 1,
			base: 0,
			hypo: 0,
			min: 0,
			max: Number.POSITIVE_INFINITY,
			target: 0,
			frozen: false,
			mainStart: 0,
			mainEnd: 0,
			mainMargins: 0,
			crossStart: 0,
			crossMargins: 0,
			crossMin: 0,
			crossMax: Number.POSITIVE_INFINITY,
			autoMainStart: false,
			autoMainEnd: false,
			autoCrossStart: false,
			autoCrossEnd: false,
			align: "stretch",
			stretch: true,
			definiteCross: false,
		};
		if (item.type === "text") {
			const c = this.contribution(item);
			base.shrink = 1;
			base.base = column ? this.layout(item, { available: cw, width: cw }).h : c.max;
			base.min = column ? base.base : c.min;
			base.hypo = Math.max(base.min, base.base);
			base.align = alignItems === "normal" ? "stretch" : alignItems;
			base.stretch = /^(normal|stretch)$/.test(alignItems);
			return base;
		}
		const { style } = item;
		const bm = boxModel(this.ctx, style, { width: cw, height: ch });
		const { main, cross } = alongAxes(bm, column);
		const m = bm.margin;
		const [ms, me, cs, ce] = column
			? (["top", "bottom", "left", "right"] as const)
			: (["left", "right", "top", "bottom"] as const);
		const it: FlexItem = {
			...base,
			edges: main.inset,
			mainStart: m[ms],
			mainEnd: m[me],
			mainMargins: m[ms] + m[me],
			crossStart: m[cs],
			crossMargins: m[cs] + m[ce],
			autoMainStart: bm.autoMargin[ms],
			autoMainEnd: bm.autoMargin[me],
			autoCrossStart: bm.autoMargin[cs],
			autoCrossEnd: bm.autoMargin[ce],
		};
		const grow = Number(value(style, "flex-grow"));
		const shrink = Number(value(style, "flex-shrink"));
		it.grow = Number.isNaN(grow) ? 0 : grow;
		it.shrink = Number.isNaN(shrink) ? 1 : shrink;
		const self = value(style, "align-self");
		it.align = self === "auto" ? (alignItems === "normal" ? "stretch" : alignItems) : self;
		const crossProp = column ? "width" : "height";
		const mainProp = column ? "height" : "width";
		const definiteCross = cross.size;
		it.definiteCross = definiteCross !== undefined;
		it.stretch =
			/^(normal|stretch)$/.test(it.align) &&
			isAuto(style, crossProp) &&
			definiteCross === undefined &&
			!it.autoCrossStart &&
			!it.autoCrossEnd;
		it.crossMin = cross.min;
		it.crossMax = cross.max;
		const mainSpec = main.size;
		/** The item's size in the main axis from its content. */
		const contentMain = (): number => {
			if (!column) return this.contribution(item).max - it.mainMargins;
			// Column: the height at the width the item will have.
			const w =
				definiteCross ??
				(it.stretch
					? Math.max(0, cw - it.crossMargins)
					: this.fitWidth(item, cw - it.crossMargins));
			return this.layout(item, { available: w, width: w, pctW: cw }).h;
		};
		const basis = value(style, "flex-basis");
		const basisLength =
			basis === "auto" || basis === "content"
				? undefined
				: setSize(this.ctx, style, bm, "flex-basis", column ? ch : cw, column ? "y" : "x");
		it.base = basisLength ?? (basis === "content" ? undefined : mainSpec) ?? contentMain();
		if (it.base === undefined || Number.isNaN(it.base)) it.base = contentMain();
		const scroll = clipsOverflow(style, column ? "y" : "x");
		const minSpec = setSize(
			this.ctx,
			style,
			bm,
			`min-${mainProp}`,
			column ? ch : cw,
			column ? "y" : "x",
		);
		if (minSpec !== undefined) it.min = minSpec;
		else if (isAuto(style, `min-${mainProp}`) && !scroll) {
			// The content-based minimum size (§4.5): min-content, no more than a specified size.
			// The content size suggestion: the content's min-content size, whatever the width says.
			let content = column
				? contentMain()
				: item.kind === "replaced"
					? this.contribution(item).min - it.mainMargins
					: this.contentContribution(item).min + main.inset;
			if (bm.ratio && definiteCross !== undefined) {
				const crossContent = Math.max(0, definiteCross - cross.inset);
				content = Math.max(
					content,
					(column ? crossContent / bm.ratio : crossContent * bm.ratio) + main.inset,
				);
			}
			it.min = mainSpec !== undefined ? Math.min(mainSpec, content) : content;
		}
		it.max = main.max;
		// Never below its padding and border (the content box can't be negative, §9.2).
		it.base = Math.max(it.base, main.inset);
		it.hypo = Math.max(it.min, Math.min(it.max, it.base));
		return it;
	}

	/** An item's hypothetical cross size at its main size (§9.4). */
	private flexCross(
		it: FlexItem,
		column: boolean,
		cw: number,
		ch: number | undefined,
		crossSize: number | undefined,
	): number {
		if (it.box.type === "text")
			return column
				? this.fitWidth(it.box, cw)
				: this.layout(it.box, { available: it.target, width: it.target }).h;
		const { style } = it.box;
		const bm = boxModel(this.ctx, style, { width: cw, height: ch });
		const { main, cross } = alongAxes(bm, column);
		if (cross.size !== undefined) return cross.size;
		if (column) {
			if (it.stretch && crossSize !== undefined) return Math.max(0, crossSize - it.crossMargins);
			// fit-content (also for auto when not stretched), max-content, min-content.
			return this.layout(it.box, { available: cw - it.crossMargins, shrink: true, pctW: cw }).w;
		}
		const ratio = bm.ratio || (it.box.kind === "replaced" ? (this.natural(it.box).ratio ?? 0) : 0);
		if (ratio) return (it.target - main.inset) / ratio + cross.inset;
		return this.layout(it.box, { available: it.target, width: it.target, pctW: cw }).h;
	}

	/** A shrink-to-fit border-box width in `avail` (fit-content). */
	private fitWidth(item: ElementBox | TextRun, avail: number): number {
		return this.layout(item, { available: avail, shrink: true }).w;
	}

	// ── Grid ─────────────────────────────────────────────────────────────

	/**
	 * A grid container's content (css-grid-1 §11): columns from the items'
	 * contributions, rows from the items laid out in their columns. Rows
	 * grow to their content (and may overflow the container); with a
	 * definite height, auto rows stretch to fill it.
	 */
	private grid(
		box: ElementBox,
		cw: number,
		ch: number | undefined,
	): { kids: Placed[]; height: number; pending: Placed[] } {
		const { style } = box;
		const pending: Placed[] = [];
		const items: (ElementBox | TextRun)[] = [];
		for (const child of box.children) {
			if (this.absolute(child))
				pending.push({
					f: this.layout(child, { available: cw, pctW: cw, pctH: ch, shrink: true }),
					x: 0,
					y: 0,
				});
			else items.push(child);
		}
		const colGap = lengthOf(this.ctx, style, "column-gap", cw) ?? 0;
		const rowGap = lengthOf(this.ctx, style, "row-gap", ch) ?? 0;
		const tracks = this.columnTracks(style, cw, cw, colGap, items.length);
		const placed = placeItems(
			items.map((k) =>
				k.type === "element" ? columnSpan(value(k.style, "grid-column"), tracks.length) : 1,
			),
			tracks.length,
		);
		const content = tracks.map(() => 0);
		for (const [i, p] of placed.entries()) {
			const item = items[i];
			if (item && p.span === 1)
				content[p.col] = Math.max(content[p.col] ?? 0, this.contribution(item).max);
		}
		const widths = sizeTracks(tracks, cw, colGap, content);
		// Rows: items in order, a new row after each row end.
		const rows: number[] = [];
		let row = 0;
		for (const p of placed) {
			rows.push(row);
			if (p.rowEnd) row++;
		}
		const nRows = row;
		const colSpace = distribute(
			cw - sum(widths) - colGap * Math.max(0, widths.length - 1),
			widths.length,
			value(style, "justify-content"),
		);
		const colX = widths.map(
			(_, i) => colSpace.start + sum(widths.slice(0, i)) + (colGap + colSpace.between) * i,
		);
		const areaW = (p: { col: number; span: number }) =>
			sum(widths.slice(p.col, p.col + p.span)) + colGap * (p.span - 1);
		const rowH = Array<number>(nRows).fill(0);
		// Rows whose height is known before their items are sized: a fixed
		// track, or a lone row filling a definite height. Item percentages
		// (max-height: 100%) resolve against it.
		const template = value(style, "grid-template-rows");
		const rowTracks =
			template === "none" ? [] : parseTracks(template, this.lengthIn(style, ch), ch ?? 0, rowGap);
		const knownH = (r: number): number | undefined => {
			const t = rowTracks[r];
			if (t?.kind === "fixed") return t.px;
			if (t === undefined && rowTracks.length === 0 && nRows === 1) return ch;
			return undefined;
		};
		for (const [i, p] of placed.entries()) {
			const item = items[i];
			if (!item) continue;
			const aw = areaW(p);
			const m =
				item.type === "element"
					? marginsOf(this.ctx, item.style, cw)
					: { top: 0, right: 0, bottom: 0, left: 0 };
			const r = rows[i] ?? 0;
			const ah = knownH(r);
			const f = this.layout(item, {
				available: aw,
				pctW: aw,
				...(ah !== undefined ? { pctH: ah } : {}),
				...(this.stretches(item, "justify", style)
					? { width: Math.max(0, aw - m.left - m.right) }
					: { shrink: true }),
			});
			rowH[r] = Math.max(rowH[r] ?? 0, f.h + m.top + m.bottom);
		}
		// Explicit row sizes (lengths only; others size to content).
		for (const [i, t] of rowTracks.entries()) if (t.kind === "fixed" && i < nRows) rowH[i] = t.px;
		// Implicit rows by grid-auto-rows: lengths, or fr rows sharing a definite height
		// (minmax(0, 1fr): even when the content is taller).
		const autoRows = value(style, "grid-auto-rows") || "auto";
		if (rowTracks.length === 0 && autoRows !== "auto") {
			const t = parseTracks(autoRows, this.lengthIn(style, ch), ch ?? 0, rowGap)[0];
			const share =
				ch !== undefined && nRows > 0 ? (ch - rowGap * Math.max(0, nRows - 1)) / nRows : undefined;
			for (let r = 0; r < nRows; r++) {
				if (t?.kind === "fixed") rowH[r] = t.px;
				else if (t?.kind === "fr" && share !== undefined)
					rowH[r] = /^minmax\(\s*0/.test(autoRows) ? share : Math.max(rowH[r] ?? 0, share);
			}
		}
		// A definite height: auto rows stretch to fill it (§11.8).
		const total = sum(rowH) + rowGap * Math.max(0, nRows - 1);
		if (
			ch !== undefined &&
			total < ch &&
			nRows > 0 &&
			/^(normal|stretch)$/.test(value(style, "align-content"))
		)
			for (let r = 0; r < nRows; r++) rowH[r] = (rowH[r] ?? 0) + (ch - total) / nRows;
		// Tracks aligned in the container (css-align-3 §5.3: align-content / justify-content).
		const rowSpace = distribute(
			ch === undefined ? 0 : ch - sum(rowH) - rowGap * Math.max(0, nRows - 1),
			nRows,
			value(style, "align-content"),
		);
		const rowY = rowH.map(
			(_, i) => rowSpace.start + sum(rowH.slice(0, i)) + (rowGap + rowSpace.between) * i,
		);
		const kids: Placed[] = [];
		for (const [i, p] of placed.entries()) {
			const item = items[i];
			if (!item) continue;
			const r = rows[i] ?? 0;
			const aw = areaW(p);
			const ah = rowH[r] ?? 0;
			const m =
				item.type === "element"
					? marginsOf(this.ctx, item.style, aw)
					: { top: 0, right: 0, bottom: 0, left: 0 };
			const stretchW = this.stretches(item, "justify", style);
			const stretchH = this.stretches(item, "align", style);
			const f = this.layout(item, {
				available: aw,
				pctW: aw,
				pctH: ah,
				...(stretchW ? { width: Math.max(0, aw - m.left - m.right) } : { shrink: true }),
				...(stretchH ? { height: Math.max(0, ah - m.top - m.bottom) } : {}),
			});
			let x = (colX[p.col] ?? 0) + m.left;
			let y = (rowY[r] ?? 0) + m.top;
			if (!stretchH && item.type === "element") {
				const a = this.selfAlign(item, "align", style);
				const free = ah - m.top - m.bottom - f.h;
				if (a === "center") y += free / 2;
				else if (a === "end" || a === "flex-end") y += free;
			}
			if (!stretchW && item.type === "element") {
				const a = this.selfAlign(item, "justify", style);
				const free = aw - m.left - m.right - f.w;
				if (a === "center") x += free / 2;
				else if (a === "end" || a === "flex-end") x += free;
			}
			kids.push({ f, x, y });
			for (const pp of f.pending) pending.push({ ...pp, x: pp.x + x, y: pp.y + y });
		}
		return { kids, height: sum(rowH) + rowGap * Math.max(0, nRows - 1), pending };
	}

	/** An item's `align-self` / `justify-self`, `auto` taken from the container's `*-items`. */
	private selfAlign(item: ElementBox, axis: "align" | "justify", container: Computed): string {
		const self = value(item.style, `${axis}-self`);
		return self !== "auto" ? self : (container.get(`${axis}-items`) ?? "normal").trim();
	}

	/** Whether an item stretches to its area in an axis (normal / stretch, auto size, no auto margins). */
	private stretches(
		item: ElementBox | TextRun,
		axis: "align" | "justify",
		container: Computed,
	): boolean {
		if (item.type === "text") return true;
		const a = this.selfAlign(item, axis, container);
		if (!/^(normal|stretch)$/.test(a)) return false;
		const size = axis === "justify" ? "width" : "height";
		if (!isAuto(item.style, size)) return false;
		const [s1, s2] =
			axis === "justify" ? (["left", "right"] as const) : (["top", "bottom"] as const);
		if (isAuto(item.style, `margin-${s1}`) || isAuto(item.style, `margin-${s2}`)) return false;
		// normal: items with an aspect ratio or a natural size don't stretch.
		if (a === "normal" && (item.kind === "replaced" || aspectRatio(item.style))) return false;
		return true;
	}

	// ── Tables ───────────────────────────────────────────────────────────

	private collapsed(box: ElementBox): boolean {
		return keyword(box.style, "border-collapse") === "collapse";
	}

	/**
	 * A cell's min / max widths. A set width makes the column fixed: its
	 * max is that width, but never below the content's min-content width
	 * (CSS 2 §17.5.2.2). In a collapsed-border table a cell keeps half of
	 * each border (`half`: what that saves).
	 */
	private cellContribution(
		box: ElementBox,
		half: number,
	): { min: number; max: number; fixed: boolean } {
		const k = this.contribution(box);
		const bm = boxModel(this.ctx, box.style);
		if (bm.width === undefined) return { min: k.min - half, max: k.max - half, fixed: false };
		const content =
			outerWidth(bm, Math.max(bm.min.width, this.contentContribution(box).min + bm.inset.x)) - half;
		// A border-box width already holds the halves.
		const borderBox = keyword(box.style, "box-sizing") === "border-box";
		const set = outerWidth(bm, borderBox ? bm.width : bm.width - half);
		return { min: content, max: Math.max(set, content), fixed: true };
	}

	/** Column min / max widths from the cells (span-1 cells first, then spanning cells spread). */
	tableColumns(box: ElementBox): { min: number[]; max: number[]; fixed: boolean[] } {
		const rows = box.rows ?? [];
		const placed = rows.map((r) => {
			let col = 0;
			return r.cells.map((c) => {
				const at = col;
				col += c.span;
				return { ...c, col: at };
			});
		});
		const n = Math.max(0, ...placed.map((r) => r.reduce((a, c) => Math.max(a, c.col + c.span), 0)));
		const min = Array<number>(n).fill(0);
		const max = Array<number>(n).fill(0);
		const fixed = Array<boolean>(n).fill(false);
		const cells = placed.flat();
		const collapse = this.collapsed(box);
		const widths = (c: (typeof cells)[number]) => {
			const { border } = edgesOf(this.ctx, c.box.style);
			return this.cellContribution(c.box, collapse ? (border.left + border.right) / 2 : 0);
		};
		for (const c of cells.filter((c) => c.span === 1)) {
			const k = widths(c);
			min[c.col] = Math.max(min[c.col] ?? 0, k.min);
			max[c.col] = Math.max(max[c.col] ?? 0, k.max);
			if (k.fixed) fixed[c.col] = true;
		}
		// A <col> width is the column's width, if its cells fit (CSS 2 §17.5.2.2).
		for (const [i, cs] of (box.cols ?? []).entries()) {
			const w = i < n ? lengthOf(this.ctx, cs, "width") : undefined;
			if (w === undefined) continue;
			max[i] = Math.max(min[i] ?? 0, w);
			fixed[i] = true;
		}
		for (const c of cells.filter((c) => c.span > 1)) {
			const k = widths(c);
			const cols = [...Array(c.span).keys()].map((i) => c.col + i).filter((i) => i < n);
			for (const [arr, need] of [
				[min, k.min],
				[max, k.max],
			] as const) {
				const have = cols.reduce((a, i) => a + (arr[i] ?? 0), 0);
				if (need > have) for (const i of cols) arr[i] = (arr[i] ?? 0) + (need - have) / cols.length;
			}
		}
		return { min, max, fixed };
	}

	/**
	 * Column widths for a table `cw` wide (Chromium's auto layout): from
	 * the min widths, fixed columns grow to their set widths first, then
	 * the others toward their max widths, in proportion to how far each
	 * can grow. Space beyond every max goes to the non-fixed columns (all
	 * of them when every column is fixed), in proportion to their max.
	 */
	private columnWidths(min: number[], max: number[], fixed: boolean[], cw: number): number[] {
		const grow = (from: number[], to: number[], which: (i: number) => boolean, room: number) => {
			const gap = from.map((f, i) => (which(i) ? Math.max(0, (to[i] ?? f) - f) : 0));
			const total = sum(gap);
			if (total <= 0 || room <= 0) return from;
			const t = Math.min(1, room / total);
			return from.map((f, i) => f + (gap[i] ?? 0) * t);
		};
		let widths = min;
		widths = grow(widths, max, (i) => fixed[i] === true, cw - sum(widths));
		widths = grow(widths, max, (i) => !fixed[i], cw - sum(widths));
		const extra = cw - sum(widths);
		if (extra > 0) {
			const loose = fixed.some((f) => !f) ? (i: number) => !fixed[i] : () => true;
			const weight = widths.map((w, i) => (loose(i) ? w : 0));
			const total = sum(weight);
			const count = widths.filter((_, i) => loose(i)).length;
			widths = widths.map(
				(w, i) =>
					w + (loose(i) ? (total > 0 ? ((weight[i] ?? 0) / total) * extra : extra / count) : 0),
			);
		}
		return widths;
	}

	/** A table's rows: columns between their min and max widths, each row as tall as its tallest cell. */
	private table(
		box: ElementBox,
		cw: number,
	): { kids: Placed[]; height: number; pending: Placed[]; columns: number[] } {
		const { min, max, fixed } = this.tableColumns(box);
		const auto = isAuto(box.style, "width");
		// An auto-width table is no wider than its columns' max widths.
		let widths = this.columnWidths(min, max, fixed, auto ? Math.min(cw, sum(max)) : cw);
		const collapse = this.collapsed(box);
		const rows = box.rows ?? [];
		// The collapsing border model (CSS 2 §17.6.2): between two cells the
		// wider of their borders, each taking half; at the table's edges the
		// wider of the cell's and the table's, half inside the cell and half
		// in the table's edge.
		const own = new Map<ElementBox, Sides>();
		const grid: (ElementBox | undefined)[][] = rows.map((row) => {
			const line: (ElementBox | undefined)[] = [];
			for (const c of row.cells) {
				own.set(c.box, edgesOf(this.ctx, c.box.style).border);
				for (let k = 0; k < c.span; k++) line.push(c.box);
			}
			return line;
		});
		const tableBorder = edgesOf(this.ctx, box.style).border;
		const halvesOf = new Map<ElementBox, Sides>();
		const inset = { top: 0, right: 0, bottom: 0, left: 0 };
		if (collapse)
			for (const [r, line] of grid.entries())
				for (const [col, cell] of line.entries()) {
					if (!cell || line[col - 1] === cell) continue;
					const b = own.get(cell) as Sides;
					const span = line.filter((x) => x === cell).length;
					const above = grid[r - 1]?.[col];
					const below = grid[r + 1]?.[col];
					const left = line[col - 1];
					const right = line[col + span];
					const half = {
						top: Math.max(b.top, above ? (own.get(above)?.bottom ?? 0) : tableBorder.top) / 2,
						bottom: Math.max(b.bottom, below ? (own.get(below)?.top ?? 0) : tableBorder.bottom) / 2,
						left: Math.max(b.left, left ? (own.get(left)?.right ?? 0) : tableBorder.left) / 2,
						right: Math.max(b.right, right ? (own.get(right)?.left ?? 0) : tableBorder.right) / 2,
					};
					halvesOf.set(cell, half);
					if (!above) inset.top = Math.max(inset.top, half.top);
					if (!below) inset.bottom = Math.max(inset.bottom, half.bottom);
					if (!left) inset.left = Math.max(inset.left, half.left);
					if (!right) inset.right = Math.max(inset.right, half.right);
				}
		const halves = (cell: ElementBox): Sides | undefined => halvesOf.get(cell);
		if (collapse) {
			const inner = cw - inset.left - inset.right;
			const scale = sum(widths) > 0 && sum(widths) > inner ? inner / sum(widths) : 1;
			if (scale !== 1) widths = widths.map((w) => w * scale);
		}
		const colX = widths.map((_, i) => inset.left + sum(widths.slice(0, i)));
		const kids: Placed[] = [];
		const pending: Placed[] = [];
		let y = inset.top;
		for (const row of rows) {
			const rs = row.style;
			let col = 0;
			const cells = row.cells.map((c) => {
				const at = col;
				col += c.span;
				const w = sum(widths.slice(at, at + c.span));
				const borders = halves(c.box);
				return {
					c,
					at,
					w,
					borders,
					natural: this.layout(c.box, {
						available: w,
						width: w,
						pctW: w,
						...(borders ? { borders } : {}),
					}),
				};
			});
			const specH = lengthOf(this.ctx, rs, "height") ?? 0;
			const h = Math.max(specH, ...cells.map((x) => x.natural.h));
			const rowFrag: Fragment = {
				box: {
					type: "element",
					el: row.el,
					style: rs,
					eid: row.eid,
					kind: "block",
					bfcRoot: true,
					children: [],
				},
				w: sum(widths),
				h,
				kids: cells.map(({ c, at, w, borders }) => ({
					f: this.layout(c.box, {
						available: w,
						width: w,
						height: h,
						pctW: w,
						pctH: h,
						...(borders ? { borders } : {}),
					}),
					x: colX[at] ?? 0,
					y: 0,
				})),
				mt: 0,
				mb: 0,
				pending: [],
			};
			kids.push({ f: rowFrag, x: inset.left, y });
			y += h;
		}
		// Rows are placed at the inset; their cells at the columns' x relative to the row.
		for (const k of kids) for (const cell of k.f.kids) cell.x -= inset.left;
		return { kids, height: y + inset.bottom, pending, columns: widths };
	}
}

/**
 * Where `n` tracks (or lines) start and the extra space between them, for a
 * `align-content` / `justify-content` value and the free space
 * (css-align-3 §5.3). Negative free space falls back as the spec says:
 * space-between to start, space-around / space-evenly to center.
 */
export function distribute(
	free: number,
	n: number,
	value: string,
): { start: number; between: number } {
	const v = value.replace(/^(safe|unsafe)\s+/, "");
	if (n <= 0) return { start: 0, between: 0 };
	if (free < 0 && /^space-(around|evenly)$/.test(v)) return { start: free / 2, between: 0 };
	if (free < 0 && v === "space-between") return { start: 0, between: 0 };
	switch (v) {
		case "center":
			return { start: free / 2, between: 0 };
		case "end":
		case "flex-end":
		case "right":
			return { start: free, between: 0 };
		case "space-between":
			return { start: 0, between: n > 1 ? free / (n - 1) : 0 };
		case "space-around":
			return { start: free / n / 2, between: free / n };
		case "space-evenly":
			return { start: free / (n + 1), between: free / (n + 1) };
		default:
			return { start: 0, between: 0 };
	}
}

/** A flex item while resolving a line (css-flexbox-1 §9). */
export interface FlexItem {
	box: ElementBox | TextRun;
	grow: number;
	shrink: number;
	/** Flex base size and hypothetical main size (border box). */
	base: number;
	/** Padding + border in the main axis (shrinking is weighted by the inner base size). */
	edges?: number;
	hypo: number;
	/** Main-size limits (min: specified or the content-based minimum). */
	min: number;
	max: number;
	/** The resolved main size. */
	target: number;
	frozen: boolean;
	mainStart: number;
	mainEnd: number;
	mainMargins: number;
	crossStart: number;
	crossMargins: number;
	crossMin: number;
	crossMax: number;
	autoMainStart: boolean;
	autoMainEnd: boolean;
	autoCrossStart: boolean;
	autoCrossEnd: boolean;
	align: string;
	/** It stretches to the line's cross size. */
	stretch: boolean;
	/** Its cross size is set (width / height), not from its content. */
	definiteCross: boolean;
	cross?: number;
	f?: Fragment;
}

/**
 * Resolve the flexible lengths of a line (css-flexbox-1 §9.7): freeze the
 * inflexible items, then repeatedly distribute the free space by flex
 * factor (scaled by base size when shrinking) and freeze the items that hit
 * their min / max.
 */
export function resolveFlexibleLengths(line: FlexItem[], avail: number, gaps: number): void {
	const outer = (it: FlexItem, size: number) => size + it.mainMargins;
	const growing = sum(line.map((it) => outer(it, it.hypo))) + gaps < avail;
	for (const it of line) {
		const factor = growing ? it.grow : it.shrink;
		it.frozen = factor === 0 || (growing && it.base > it.hypo) || (!growing && it.base < it.hypo);
		it.target = it.frozen ? it.hypo : it.base;
	}
	const used = () => sum(line.map((it) => outer(it, it.frozen ? it.target : it.base))) + gaps;
	const initialFree = avail - used();
	for (let round = 0; round <= line.length; round++) {
		const open = line.filter((it) => !it.frozen);
		if (open.length === 0) break;
		let free = avail - used();
		const factors = sum(open.map((it) => (growing ? it.grow : it.shrink)));
		if (factors < 1) {
			const scaled = initialFree * factors;
			if (Math.abs(scaled) < Math.abs(free)) free = scaled;
		}
		for (const it of open) {
			if (free === 0) it.target = it.base;
			else if (growing) it.target = it.base + (factors > 0 ? (free * it.grow) / factors : 0);
			else {
				const inner = (o: FlexItem) => Math.max(0, o.base - (o.edges ?? 0));
				const scaled = sum(open.map((o) => o.shrink * inner(o)));
				it.target = it.base - (scaled > 0 ? (Math.abs(free) * it.shrink * inner(it)) / scaled : 0);
			}
		}
		let total = 0;
		const violation = new Map<FlexItem, number>();
		for (const it of open) {
			const clamped = Math.max(it.min, Math.min(it.max, it.target));
			violation.set(it, clamped - it.target);
			total += clamped - it.target;
			it.target = clamped;
		}
		for (const it of open)
			if (
				total === 0 ||
				(total > 0 && (violation.get(it) ?? 0) > 0) ||
				(total < 0 && (violation.get(it) ?? 0) < 0)
			)
				it.frozen = true;
	}
}
