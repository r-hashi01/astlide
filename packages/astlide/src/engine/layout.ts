/**
 * Box layout: map the box tree (box-tree.ts) onto a Yoga tree (block flow as
 * a column flexbox, flex as flex, grids as rows of columns) with inline
 * formatting contexts as measured leaves, then read back absolute boxes and
 * text lines.
 */

import type { Element } from "domhandler";
import Yoga, {
	Align,
	BoxSizing,
	Direction,
	Edge,
	FlexDirection,
	Gutter,
	Justify,
	MeasureMode,
	PositionType,
	Wrap,
	type Node as YogaNode,
} from "yoga-layout";
import { type ElementBox, isElement, StyleContext, type TextRun } from "./box-tree";
import { type Computed, computeStyle, type StyleSheets, toPx, type Viewport } from "./cascade";
import { Flow, type Fragment } from "./flow";
import { columnSpan, parseTracks, placeItems, sizeTracks } from "./grid";
import type { NaturalSize } from "./images";
import {
	type FontRegistry,
	type InlineItem,
	type InlineStyle,
	layoutLines,
	verticalMetrics,
} from "./text";
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

const EDGES: [string, Edge][] = [
	["top", Edge.Top],
	["right", Edge.Right],
	["bottom", Edge.Bottom],
	["left", Edge.Left],
];

interface Leaf {
	node: YogaNode;
	items: InlineItem[];
	strut: InlineStyle;
	align: string;
}

interface BoxNode {
	node: YogaNode;
	el: Element;
	style: Computed;
	eid: number;
}

/** A deferred percentage size: the percentage and the box it refers to. */
interface Cyclic {
	pct: number;
	parent: YogaNode;
}

/** A grid container while building: its items, columns sized once its width is known. */
interface GridNode {
	node: YogaNode;
	style: Computed;
	gap: number;
	items: { node: YogaNode; gridColumn: string }[];
	/** Each item's width from the first layout (its content), for `auto` columns. */
	content?: number[];
}

/** A table cell while building: its grid position and content widths (border box). */
interface CellNode {
	node: YogaNode;
	style: Computed;
	eid: number;
	col: number;
	span: number;
	min: number;
	max: number;
	/** Horizontal padding + border: subtracted again when the cell is content-box. */
	edges: number;
}

interface TableNode {
	node: YogaNode;
	style: Computed;
	eid: number;
	rows: { node: YogaNode; eid: number; cells: CellNode[] }[];
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

class Builder {
	/** Computed styles, element ids and inline content: the box tree's side (box-tree.ts). */
	readonly ctx: StyleContext;
	readonly leaves: Leaf[] = [];
	readonly boxNodes: BoxNode[] = [];
	readonly tables: TableNode[] = [];
	readonly grids: GridNode[] = [];
	/** Boxes whose width comes from their content (a row flex item, an inline-block …). */
	readonly contentSized = new Set<YogaNode>();
	readonly config = Yoga.Config.create();
	/** Parent of each node we created (Yoga's getParent/getChild return fresh wrappers). */
	readonly parents = new Map<YogaNode, YogaNode>();
	/** Resolved vertical margins of block boxes (px), for margin collapsing. */
	readonly margins = new Map<YogaNode, { top: number; bottom: number }>();

	private add(parent: YogaNode, child: YogaNode): void {
		parent.insertChild(child, parent.getChildCount());
		this.parents.set(child, parent);
	}

	private readonly affines = new Map<YogaNode, Affine>();
	private readonly nodeStyles = new Map<YogaNode, Computed>();

	/**
	 * Where a node's own transform and its ancestors' put what's laid out in
	 * it (translations and scales; see `transform.ts`).
	 */
	affineOf(node: YogaNode): Affine {
		const known = this.affines.get(node);
		if (known) return known;
		if (this.nodeStyles.size === 0)
			for (const bn of this.boxNodes) this.nodeStyles.set(bn.node, bn.style);
		const parent = this.parents.get(node);
		let a = parent ? this.affineOf(parent) : IDENTITY;
		const style = this.nodeStyles.get(node);
		const transform = style?.get("transform");
		if (style && transform && transform !== "none") {
			const fs = Number.parseFloat(style.get("font-size") ?? "16");
			const p = this.absolute(node);
			const own = boxTransform(
				transform,
				style.get("transform-origin") ?? "",
				{ x: p.x, y: p.y, w: node.getComputedWidth(), h: node.getComputedHeight() },
				(v, basis) => toPx(v, fs, this.ctx.rootFontSize, this.vp, basis),
			);
			if (own) a = compose(a, own);
		}
		this.affines.set(node, a);
		return a;
	}

	/** Absolute position of a node's border box. */
	absolute(node: YogaNode): { x: number; y: number } {
		let x = 0;
		let y = 0;
		for (let n: YogaNode | undefined = node; n; n = this.parents.get(n)) {
			x += n.getComputedLeft();
			y += n.getComputedTop();
		}
		return { x, y };
	}

	constructor(
		readonly sheets: StyleSheets,
		readonly fonts: FontRegistry,
		readonly vp: Viewport,
	) {
		this.ctx = new StyleContext(sheets, fonts, vp);
		this.config.setUseWebDefaults(true);
		this.config.setPointScaleFactor(64);
	}

	/** A length in px, or NaN for keywords. */
	px(style: Computed, prop: string, basis = Number.NaN): number {
		return this.ctx.px(style, prop, basis);
	}

	inlineStyle(style: Computed): InlineStyle {
		return this.ctx.inlineStyle(style);
	}

	private setLength(style: Computed, prop: string, set: (v: number | `${number}%`) => void): void {
		const raw = (style.get(prop) ?? "auto").trim();
		if (
			raw === "auto" ||
			raw === "none" ||
			raw === "" ||
			raw === "normal" ||
			/^(fit|min|max)-content$|^fit-content\(/.test(raw)
		)
			return;
		const pct = raw.match(/^(-?[\d.]+)%$/);
		if (pct) {
			set(`${Number(pct[1])}%`);
			return;
		}
		const v = this.px(style, prop);
		if (!Number.isNaN(v)) set(v);
	}

	private applyBox(node: YogaNode, style: Computed): void {
		node.setBoxSizing(
			style.get("box-sizing") === "border-box" ? BoxSizing.BorderBox : BoxSizing.ContentBox,
		);
		this.setLength(style, "width", (v) => node.setWidth(v));
		this.setLength(style, "height", (v) => node.setHeight(v));
		this.setLength(style, "min-width", (v) => node.setMinWidth(v));
		this.setLength(style, "min-height", (v) => node.setMinHeight(v));
		this.setLength(style, "max-width", (v) => node.setMaxWidth(v));
		this.setLength(style, "max-height", (v) => node.setMaxHeight(v));
		const vertical = { top: 0, bottom: 0 };
		for (const [side, edge] of EDGES) {
			if ((style.get(`margin-${side}`) ?? "0").trim() === "auto") node.setMarginAuto(edge);
			else
				this.setLength(style, `margin-${side}`, (v) => {
					node.setMargin(edge, v);
					if (typeof v === "number" && (side === "top" || side === "bottom")) vertical[side] = v;
				});
			this.setLength(style, `padding-${side}`, (v) => node.setPadding(edge, v));
			const bw = this.px(style, `border-${side}-width`);
			if (bw > 0) node.setBorder(edge, bw);
		}
		this.margins.set(node, vertical);
		const ar = (style.get("aspect-ratio") ?? "auto").match(/([\d.]+)\s*(?:\/\s*([\d.]+))?/);
		const ratio = ar && Number(ar[1]) > 0 ? Number(ar[1]) / Number(ar[2] ?? 1) : 0;
		// With both width and height set, aspect-ratio doesn't apply.
		const sized = (prop: string) => !/^(auto|)$/.test((style.get(prop) ?? "auto").trim());
		if (ratio && !(sized("width") && sized("height"))) node.setAspectRatio(ratio);
		// Absolute boxes are placed against their containing block, the nearest
		// positioned ancestor: static boxes (CSS's default) don't count, as in browsers.
		const position = style.get("position") ?? "static";
		if (position === "absolute") {
			node.setPositionType(PositionType.Absolute);
			for (const [side, edge] of EDGES)
				this.setLength(style, side, (v) => node.setPosition(edge, v));
		} else if (position === "static") node.setPositionType(PositionType.Static);
		else if (position === "relative" || position === "sticky")
			for (const [side, edge] of EDGES)
				this.setLength(style, side, (v) => node.setPosition(edge, v));
		const grow = Number(style.get("flex-grow") ?? 0);
		const shrink = Number(style.get("flex-shrink") ?? 1);
		node.setFlexGrow(Number.isNaN(grow) ? 0 : grow);
		node.setFlexShrink(Number.isNaN(shrink) ? 1 : shrink);
		// With aspect-ratio, the automatic minimum size (min-height: auto) keeps
		// the ratio: the box overflows rather than shrinks.
		if (ratio && (style.get("min-height") ?? "auto") === "auto") node.setFlexShrink(0);
		this.setLength(style, "flex-basis", (v) => node.setFlexBasis(v));
		const alignSelf = style.get("align-self");
		if (alignSelf && alignSelf !== "auto") node.setAlignSelf(alignOf(alignSelf));
	}

	/** A run of inline content: a node measured by line breaking. */
	private yogaLeaf(run: TextRun): YogaNode {
		const { items, strut } = run;
		const node = Yoga.Node.create(this.config);
		// The text's width on one line per forced break (max-content), measured once.
		let maxContent: number | undefined;
		node.setMeasureFunc((width, widthMode) => {
			const max = widthMode === MeasureMode.Undefined ? Number.POSITIVE_INFINITY : width;
			const r = layoutLines(items, max, strut, "left", this.fonts);
			maxContent ??= layoutLines(items, Number.POSITIVE_INFINITY, strut, "left", this.fonts).width;
			return {
				// Shrink-to-fit, as CSS: max-content, or all the room when that's wider
				// (not the widest of the lines it wrapped into).
				width: widthMode === MeasureMode.Exactly ? width : Math.min(maxContent, max),
				height: r.height,
			};
		});
		this.leaves.push({ node, items, strut, align: run.align });
		return node;
	}

	/**
	 * A table as a column of rows of cells. Column widths need the table's
	 * width, so they are set after a first layout ({@link sizeTables}); here
	 * each cell records its min- / max-content width.
	 */
	private yogaTable(box: ElementBox, node: YogaNode): YogaNode {
		node.setFlexDirection(FlexDirection.Column);
		node.setAlignItems(Align.Stretch);
		const table: TableNode = { node, style: box.style, eid: box.eid, rows: [] };
		const len = (s: Computed, prop: string) => {
			const v = this.px(s, prop);
			return Number.isNaN(v) ? 0 : v;
		};
		for (const row of box.rows ?? []) {
			const rowNode = Yoga.Node.create(this.config);
			this.applyBox(rowNode, row.style);
			rowNode.setFlexDirection(FlexDirection.Row);
			rowNode.setAlignItems(Align.Stretch);
			this.add(node, rowNode);
			const rowEid = row.eid;
			this.boxNodes.push({ node: rowNode, el: row.el, style: row.style, eid: rowEid });
			const cells: CellNode[] = [];
			let col = 0;
			for (const { box: cell, span } of row.cells) {
				const cs = cell.style;
				const before = this.leaves.length;
				const at = this.boxNodes.length;
				const cn = this.yoga(cell);
				cn.setFlexGrow(0);
				cn.setFlexShrink(0);
				const va = cs.get("vertical-align") ?? "middle";
				cn.setJustifyContent(
					va === "top" ? Justify.FlexStart : va === "bottom" ? Justify.FlexEnd : Justify.Center,
				);
				this.add(rowNode, cn);
				const eid = cell.eid;
				this.boxNodes.splice(at, 0, { node: cn, el: cell.el, style: cs, eid });
				const leaves = this.leaves.slice(before);
				const edges = ["padding-left", "padding-right", "border-left-width", "border-right-width"]
					.map((p) => len(cs, p))
					.reduce((a, b) => a + b, 0);
				const content = (w: number) =>
					Math.max(
						0,
						...leaves.map((l) => layoutLines(l.items, w, l.strut, "left", this.fonts).width),
					);
				cells.push({
					node: cn,
					style: cs,
					eid,
					col,
					span,
					min: content(0) + edges,
					max: content(Number.POSITIVE_INFINITY) + edges,
					edges: cs.get("box-sizing") === "border-box" ? 0 : edges,
				});
				col += span;
			}
			table.rows.push({ node: rowNode, eid: rowEid, cells });
		}
		this.tables.push(table);
		return node;
	}

	/**
	 * Percentages inside a box sized by its content are cyclic: as in
	 * browsers, the box is sized with them as `auto`, then they resolve
	 * against its size. Widths are cyclic in a content-sized box (a row flex
	 * item that doesn't grow, an inline-block …); heights in any box whose
	 * height isn't a length. {@link deferCyclicSizes} before the first layout,
	 * then {@link resolveCyclicSizes} once the containers' sizes are known.
	 */
	private readonly cyclic = {
		width: new Map<YogaNode, Cyclic>(),
		height: new Map<YogaNode, Cyclic>(),
	};

	/** Before the first layout: cyclic percentages as auto (see {@link resolveCyclicSizes}). */
	deferCyclicSizes(): void {
		const styles = new Map(this.boxNodes.map((bn) => [bn.node, bn.style]));
		const fixedHeight = (node: YogaNode) =>
			!/^(auto|fit-content|max-content|min-content|)$/.test(
				(styles.get(node)?.get("height") ?? "auto").trim(),
			);
		for (const bn of this.boxNodes) {
			const parent = this.parents.get(bn.node);
			if (!parent) continue;
			for (const axis of ["width", "height"] as const) {
				const pending = this.cyclic[axis];
				const pct = (bn.style.get(axis) ?? "").trim().match(/^([\d.]+)%$/);
				if (!pct) continue;
				// Tree order: a parent whose own percentage is deferred comes first.
				const cyclic =
					pending.has(parent) ||
					(axis === "width"
						? this.contentSized.has(parent)
						: styles.has(parent) && !fixedHeight(parent));
				if (!cyclic) continue;
				pending.set(bn.node, { pct: Number(pct[1]), parent });
				// As auto: a picture's own size (its width / height attribute), else its content's.
				const own = Number.parseFloat(bn.el.attribs[axis] ?? "");
				const picture = /^(svg|img)$/.test(bn.el.name) && own > 0;
				if (axis === "width") picture ? bn.node.setWidth(own) : bn.node.setWidthAuto();
				else picture ? bn.node.setHeight(own) : bn.node.setHeightAuto();
			}
		}
	}

	/** Resolve the deferred percentages, outer boxes first, laying out again as it goes. */
	resolveCyclicSizes(relayout: () => void): void {
		const { width, height } = this.cyclic;
		if (width.size + height.size === 0) return;
		const resolved = { width: new Set<YogaNode>(), height: new Set<YogaNode>() };
		// Widths first: they decide how text wraps, and so the heights.
		for (const axis of ["width", "height"] as const) {
			const pending = this.cyclic[axis];
			for (let pass = 0; pass < 8 && pending.size > 0; pass++) {
				const ready = [...pending].filter(([, p]) => !pending.has(p.parent));
				for (const [node, { pct, parent }] of ready) {
					const [a, b] = axis === "width" ? [Edge.Left, Edge.Right] : [Edge.Top, Edge.Bottom];
					const outer = axis === "width" ? parent.getComputedWidth() : parent.getComputedHeight();
					const content =
						outer -
						parent.getComputedPadding(a) -
						parent.getComputedPadding(b) -
						parent.getComputedBorder(a) -
						parent.getComputedBorder(b);
					// The parent keeps the size it got with the percentage as auto —
					// unless it's a percentage itself, already set (fixing it again
					// would shrink it twice).
					if (!resolved[axis].has(parent)) {
						const size = parent.getBoxSizing() === BoxSizing.BorderBox ? outer : content;
						axis === "width" ? parent.setWidth(size) : parent.setHeight(size);
					}
					const size = (pct / 100) * content;
					axis === "width" ? node.setWidth(size) : node.setHeight(size);
					// Width and height both set again: aspect-ratio no longer applies.
					if (!this.cyclic.width.has(node) && !this.cyclic.height.has(node))
						node.setAspectRatio(Number.NaN);
					pending.delete(node);
					resolved[axis].add(node);
				}
				relayout();
			}
		}
	}

	/**
	 * Size grid columns from each container's content width and give every
	 * item its columns' width; the item ending a row gets the rest of the row
	 * as its right margin, so the next item starts a new flex line. The first
	 * call (after a layout with unsized items) records their content widths
	 * for `auto` columns. Returns whether a width changed.
	 */
	sizeGrids(): boolean {
		let changed = false;
		for (const g of this.grids) {
			g.content ??= g.items.map((it) => it.node.getComputedWidth());
			const inner =
				g.node.getComputedWidth() -
				g.node.getComputedPadding(Edge.Left) -
				g.node.getComputedPadding(Edge.Right) -
				g.node.getComputedBorder(Edge.Left) -
				g.node.getComputedBorder(Edge.Right);
			const fs = Number.parseFloat(g.style.get("font-size") ?? "16");
			const length = (v: string) => toPx(v, fs, this.ctx.rootFontSize, this.vp, inner);
			const tracks = parseTracks(
				g.style.get("grid-template-columns") ?? "none",
				length,
				inner,
				g.gap,
			);
			const placed = placeItems(
				g.items.map((it) => columnSpan(it.gridColumn, tracks.length)),
				tracks.length,
			);
			const content = tracks.map(() => 0);
			for (const [i, p] of placed.entries())
				if (p.span === 1) content[p.col] = Math.max(content[p.col] ?? 0, g.content[i] ?? 0);
			const widths = sizeTracks(tracks, inner, g.gap, content);
			let used = 0;
			for (const [i, p] of placed.entries()) {
				const item = g.items[i];
				if (!item) continue;
				const w =
					widths.slice(p.col, p.col + p.span).reduce((s, x) => s + x, 0) + g.gap * (p.span - 1);
				used += (p.col > 0 ? g.gap : 0) + w;
				// Half a pixel under the rest of the row (negative for a full row): Yoga
				// adds widths in float32, and a row a hair over the width wraps.
				const margin = p.rowEnd ? inner - used - 0.5 : 0;
				if (p.rowEnd) used = 0;
				if (
					Math.abs(item.node.getComputedWidth() - w) > 0.01 ||
					Math.abs(item.node.getComputedMargin(Edge.Right) - margin) > 0.01
				)
					changed = true;
				item.node.setWidth(w);
				item.node.setMargin(Edge.Right, margin);
			}
		}
		return changed;
	}

	/**
	 * Column widths (CSS automatic table layout, simplified): every column gets
	 * its max-content width when that fits, widened in proportion to fill a
	 * table with a set width; otherwise between min- and max-content.
	 * Returns whether anything changed (a relayout is needed).
	 */
	sizeTables(): boolean {
		for (const t of this.tables) {
			const n = Math.max(
				0,
				...t.rows.map((r) => r.cells.reduce((a, c) => Math.max(a, c.col + c.span), 0)),
			);
			if (n === 0) continue;
			const min = Array<number>(n).fill(0);
			const max = Array<number>(n).fill(0);
			const cells = t.rows.flatMap((r) => r.cells);
			for (const c of cells.filter((c) => c.span === 1)) {
				min[c.col] = Math.max(min[c.col] ?? 0, c.min);
				max[c.col] = Math.max(max[c.col] ?? 0, c.max);
			}
			for (const c of cells.filter((c) => c.span > 1)) {
				const cols = [...Array(c.span).keys()].map((i) => c.col + i).filter((i) => i < n);
				for (const [arr, need] of [
					[min, c.min],
					[max, c.max],
				] as const) {
					const have = cols.reduce((a, i) => a + (arr[i] ?? 0), 0);
					if (need > have)
						for (const i of cols) arr[i] = (arr[i] ?? 0) + (need - have) / cols.length;
				}
			}
			const node = t.node;
			const inner =
				node.getComputedWidth() -
				node.getComputedPadding(Edge.Left) -
				node.getComputedPadding(Edge.Right) -
				node.getComputedBorder(Edge.Left) -
				node.getComputedBorder(Edge.Right);
			const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
			const sumMin = sum(min);
			const sumMax = sum(max);
			const auto = (t.style.get("width") ?? "auto").trim() === "auto";
			let widths: number[];
			if (sumMax <= inner) {
				widths = auto ? max : max.map((m) => m + (inner - sumMax) * (sumMax ? m / sumMax : 1 / n));
			} else if (sumMin < inner) {
				widths = min.map(
					(m, i) => m + (((max[i] ?? m) - m) * (inner - sumMin)) / (sumMax - sumMin),
				);
			} else widths = min;
			if (auto && sumMax <= inner) {
				const extra = node.getComputedWidth() - inner;
				node.setWidth(sum(widths) + extra);
			}
			for (const c of cells)
				c.node.setWidth(Math.max(0, sum(widths.slice(c.col, c.col + c.span)) - c.edges));
		}
		return this.tables.length > 0;
	}

	/**
	 * An image's own size (its `width` / `height` attributes) where CSS leaves
	 * it `auto`, and its aspect ratio, so a `max-width` scales the height too.
	 */
	private replacedSize(el: Element, node: YogaNode, style: Computed): void {
		const auto = (prop: string) => (style.get(prop) ?? "auto").trim() === "auto";
		const px = (v: string | undefined) =>
			v && /^[\d.]+(px)?$/.test(v.trim()) ? Number.parseFloat(v) : Number.NaN;
		const w = px(el.attribs.width);
		const h = px(el.attribs.height);
		const view = (el.attribs.viewBox ?? el.attribs.viewbox ?? "")
			.trim()
			.split(/[\s,]+/)
			.map(Number);
		const ratio =
			w > 0 && h > 0
				? w / h
				: (view[2] ?? 0) > 0 && (view[3] ?? 0) > 0
					? (view[2] ?? 1) / (view[3] ?? 1)
					: Number.NaN;
		if (auto("width") && w > 0) node.setWidth(w);
		else if (auto("width") && el.name !== "img" && !(ratio > 0)) node.setWidth(300);
		if (auto("height") && !(ratio > 0)) node.setHeight(h > 0 ? h : 150);
		// The picture's ratio sizes the side CSS leaves auto; with both set, it doesn't apply.
		if (ratio > 0 && (auto("width") || auto("height"))) node.setAspectRatio(ratio);
	}

	/**
	 * @param bfcRoot - The element establishes its own block formatting context
	 *   (root, flex / grid item, overflow ≠ visible …): child margins don't collapse through it.
	 */
	/** The Yoga node of a box and its subtree. */
	yoga(box: ElementBox): YogaNode {
		const { el, style, bfcRoot } = box;
		const node = Yoga.Node.create(this.config);
		this.applyBox(node, style);
		if (box.kind === "replaced") {
			this.replacedSize(el, node, style);
			return node;
		}
		if (box.kind === "table") return this.yogaTable(box, node);

		const isFlex = box.kind === "flex";
		const isGrid = box.kind === "grid";
		if (isFlex) {
			const dir = style.get("flex-direction") ?? "row";
			node.setFlexDirection(
				dir === "column"
					? FlexDirection.Column
					: dir === "column-reverse"
						? FlexDirection.ColumnReverse
						: dir === "row-reverse"
							? FlexDirection.RowReverse
							: FlexDirection.Row,
			);
			node.setFlexWrap(
				/^wrap(-reverse)?$/.test((style.get("flex-wrap") ?? "").trim()) ? Wrap.Wrap : Wrap.NoWrap,
			);
			node.setJustifyContent(justifyOf(style.get("justify-content") ?? "flex-start"));
			const ai = style.get("align-items") ?? "stretch";
			node.setAlignItems(ai === "normal" ? Align.Stretch : alignOf(ai));
			const ac = style.get("align-content") ?? "normal";
			node.setAlignContent(
				ac === "normal" || ac === "stretch"
					? Align.Stretch
					: ac === "space-between"
						? Align.SpaceBetween
						: ac === "space-around"
							? Align.SpaceAround
							: alignOf(ac),
			);
		} else if (isGrid) {
			node.setFlexDirection(FlexDirection.Row);
			node.setFlexWrap(Wrap.Wrap);
			node.setAlignItems(Align.Stretch);
		} else {
			// Block flow ≈ a column of stretched blocks (no margin collapsing yet).
			node.setFlexDirection(FlexDirection.Column);
			node.setAlignItems(Align.Stretch);
		}
		const rg = this.px(style, "row-gap");
		const cg = this.px(style, "column-gap");
		if (!Number.isNaN(rg)) node.setGap(Gutter.Row, rg);
		if (!Number.isNaN(cg)) node.setGap(Gutter.Column, cg);

		const grid: GridNode | null = isGrid
			? { node, style, gap: Number.isNaN(cg) ? 0 : cg, items: [] }
			: null;
		if (grid) this.grids.push(grid);

		const container = isFlex || isGrid;
		for (const childBox of box.children) {
			if (childBox.type === "text") {
				const leaf = this.yogaLeaf(childBox);
				if (childBox.inFlow) leaf.setFlexShrink(0); // lines of text don't shrink in block flow
				this.add(node, leaf);
				continue;
			}
			const { el: child, style: cs } = childBox;
			const childDisplay = cs.get("display") ?? "block";
			// Paint order is tree order: the child's box goes before its descendants'.
			const at = this.boxNodes.length;
			const yn = this.yoga(childBox);
			// width: fit-content / max-content in a column: size to content instead of stretching.
			const w = (cs.get("width") ?? "auto").trim();
			const stretches =
				!container || (style.get("align-items") ?? "stretch").match(/^(stretch|normal)$/);
			const column = !container || /column/.test(style.get("flex-direction") ?? "row");
			// Block flow never shrinks its children; a column flex item with
			// min-height: auto doesn't shrink below its content (it overflows).
			if (!container || (column && (cs.get("min-height") ?? "auto") === "auto"))
				yn.setFlexShrink(0);
			// In a row, an aspect-ratio box shrinks like any other (its height
			// follows); only its height keeps it from shrinking in a column.
			else if (container && !column && (cs.get("aspect-ratio") ?? "auto") !== "auto") {
				const shrink = Number(cs.get("flex-shrink") ?? 1);
				yn.setFlexShrink(Number.isNaN(shrink) ? 1 : shrink);
			}
			if (
				/^(fit-content|max-content|min-content)$/.test(w) &&
				stretches &&
				column &&
				!cs.get("align-self")?.match(/center|end|start/)
			) {
				yn.setAlignSelf(Align.FlexStart);
			}
			const entry: BoxNode = { node: yn, el: child, style: cs, eid: childBox.eid };
			// Content-sized: a row flex item that doesn't grow, a column flex item
			// that isn't stretched, or (in flow) an inline-block, float or absolute
			// box. Grid items take their column's width; flex and grid items are
			// blockified, so inline-block doesn't make them shrink-to-fit.
			if (
				!grid &&
				/^(auto|fit-content|max-content|min-content)$/.test(w) &&
				((container &&
					!column &&
					Number(cs.get("flex-grow") ?? 0) === 0 &&
					(cs.get("flex-basis") ?? "auto") === "auto") ||
					(container && !stretches) ||
					/^(absolute|fixed)$/.test(cs.get("position") ?? "") ||
					(!container &&
						(/^inline-(block|flex|grid)$/.test(childDisplay) ||
							/^(left|right)$/.test(cs.get("float") ?? ""))))
			)
				this.contentSized.add(yn);
			// Absolutely positioned children aren't grid items.
			if (grid && !/^(absolute|fixed)$/.test(cs.get("position") ?? "")) {
				yn.setFlexGrow(0);
				yn.setFlexShrink(0);
				grid.items.push({ node: yn, gridColumn: cs.get("grid-column") ?? "" });
			}
			this.add(node, yn);
			this.boxNodes.splice(at, 0, entry);
		}
		if (!container) this.collapseMargins(node, style, bfcRoot);
		return node;
	}

	/**
	 * Block-flow margin collapsing (CSS 2 §8.3.1) for the child boxes of `node`:
	 * adjacent siblings, and first / last child through a parent without
	 * padding / border that isn't a formatting-context root.
	 */
	private collapseMargins(node: YogaNode, style: Computed, bfcRoot: boolean): void {
		const kids: YogaNode[] = [];
		for (const [child, parent] of this.parents) if (parent === node) kids.push(child);
		const blocks = kids.map((k) => ({ node: k, m: this.margins.get(k) }));
		const join = (a: number, b: number) => Math.max(a, b, 0) + Math.min(a, b, 0);
		for (let i = 1; i < blocks.length; i++) {
			const a = blocks[i - 1];
			const b = blocks[i];
			if (!a?.m || !b?.m) continue; // an inline leaf (line boxes) in between
			const merged = join(a.m.bottom, b.m.top);
			a.m.bottom = 0;
			a.node.setMargin(Edge.Bottom, 0);
			b.m.top = merged;
			b.node.setMargin(Edge.Top, merged);
		}
		if (bfcRoot) return;
		const own = this.margins.get(node);
		if (!own) return;
		const zero = (p: string) => (this.px(style, p) || 0) === 0;
		const first = blocks[0];
		if (first?.m && zero("padding-top") && zero("border-top-width")) {
			own.top = join(own.top, first.m.top);
			node.setMargin(Edge.Top, own.top);
			first.m.top = 0;
			first.node.setMargin(Edge.Top, 0);
		}
		const last = blocks[blocks.length - 1];
		if (
			last?.m &&
			zero("padding-bottom") &&
			zero("border-bottom-width") &&
			(style.get("height") ?? "auto") === "auto"
		) {
			own.bottom = join(own.bottom, last.m.bottom);
			node.setMargin(Edge.Bottom, own.bottom);
			last.m.bottom = 0;
			last.node.setMargin(Edge.Bottom, 0);
		}
	}
}

function alignOf(v: string): Align {
	switch (v) {
		case "center":
			return Align.Center;
		case "flex-start":
		case "start":
		case "self-start":
			return Align.FlexStart;
		case "flex-end":
		case "end":
		case "self-end":
			return Align.FlexEnd;
		case "baseline":
			return Align.Baseline;
		default:
			return Align.Stretch;
	}
}

function justifyOf(v: string): Justify {
	switch (v) {
		case "center":
			return Justify.Center;
		case "flex-end":
		case "end":
			return Justify.FlexEnd;
		case "space-between":
			return Justify.SpaceBetween;
		case "space-around":
			return Justify.SpaceAround;
		case "space-evenly":
			return Justify.SpaceEvenly;
		default:
			return Justify.FlexStart;
	}
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
	const b = new Builder(sheets, fonts, vp);
	if (images) b.ctx.images = images;
	let parent: Computed | null = null;
	for (const a of ancestors) {
		parent = b.ctx.styleOf(a, parent);
		if (a.name === "html") b.ctx.rootFontSize = Number.parseFloat(parent.get("font-size") ?? "16");
	}
	// Element ids in document order (matches querySelectorAll("*") in the slide).
	let next = 0;
	const number = (el: Element) => {
		for (const c of el.children) {
			if (isElement(c)) {
				b.ctx.eids.set(c, next++);
				number(c);
			}
		}
	};
	number(slide);

	const slideStyle = b.ctx.styleOf(slide, parent);
	const tree = b.ctx.box(slide, slideStyle);
	// The layout core laid out from constraints (#357), while it replaces the Yoga tree below.
	if (process.env.ASTLIDE_ENGINE_CORE === "flow")
		return flowLayout(b.ctx, tree, slideStyle, sheets, fonts, vp);
	const root = tree ? b.yoga(tree) : null;
	if (!root)
		return {
			width: 0,
			height: 0,
			style: slideStyle,
			boxes: [],
			inlineBoxes: [],
			lines: [],
			markers: [],
			tables: [],
			elements: [],
		};
	if ((slideStyle.get("width") ?? "auto") === "auto") root.setWidth(vp.width);
	if ((slideStyle.get("height") ?? "auto") === "auto") root.setHeight(vp.height);

	b.deferCyclicSizes();
	root.calculateLayout(vp.width, vp.height, Direction.LTR);
	// Grid columns, once the containers' widths are known: again while a nested
	// grid's container width changes with its parent's columns (one more level
	// settles per pass).
	for (let pass = 0; pass < 8 && b.sizeGrids(); pass++)
		root.calculateLayout(vp.width, vp.height, Direction.LTR);
	// Tables: column widths from the table's width, then lay out again.
	// Cyclic percentages, once grid columns have set the widths they depend on.
	b.resolveCyclicSizes(() => root.calculateLayout(vp.width, vp.height, Direction.LTR));
	if (b.sizeTables()) root.calculateLayout(vp.width, vp.height, Direction.LTR);

	// Clipping: ancestors with overflow ≠ visible clip descendants to their padding box.
	const styleOf = new Map<YogaNode, Computed>(b.boxNodes.map((bn) => [bn.node, bn.style]));
	styleOf.set(root, slideStyle);
	const clips = new Map<YogaNode, Rect | undefined>();
	const clipOf = (node: YogaNode): Rect | undefined => {
		if (clips.has(node)) return clips.get(node);
		const parent = b.parents.get(node);
		let clip = parent ? clipOf(parent) : undefined;
		const ps = parent ? styleOf.get(parent) : undefined;
		if (parent && ps) {
			const o = `${ps.get("overflow") ?? ""} ${ps.get("overflow-x") ?? ""} ${ps.get("overflow-y") ?? ""}`;
			if (/hidden|clip|auto|scroll/.test(o)) {
				const p = b.absolute(parent);
				const own = mapRect(b.affineOf(parent), {
					x: p.x + parent.getComputedBorder(Edge.Left),
					y: p.y + parent.getComputedBorder(Edge.Top),
					w:
						parent.getComputedWidth() -
						parent.getComputedBorder(Edge.Left) -
						parent.getComputedBorder(Edge.Right),
					h:
						parent.getComputedHeight() -
						parent.getComputedBorder(Edge.Top) -
						parent.getComputedBorder(Edge.Bottom),
				});
				clip = clip ? intersect(clip, own) : own;
			}
		}
		clips.set(node, clip);
		return clip;
	};
	const boxes: Box[] = [];
	for (const bn of b.boxNodes) {
		const p = b.absolute(bn.node);
		boxes.push(
			mapRect(b.affineOf(bn.node), {
				clip: clipOf(bn.node),
				eid: bn.eid,
				tag: bn.el.name,
				x: p.x,
				y: p.y,
				w: bn.node.getComputedWidth(),
				h: bn.node.getComputedHeight(),
				style: bn.style,
				alpha: Number(bn.style.get("__alpha") ?? 1),
			}),
		);
	}
	const lines: TextLine[] = [];
	const inlineBoxes: InlineBox[] = [];
	for (const [id, leaf] of b.leaves.entries()) {
		const p = b.absolute(leaf.node);
		const width = leaf.node.getComputedWidth();
		const r = layoutLines(leaf.items, width, leaf.strut, leaf.align, fonts);
		const a = b.affineOf(leaf.node);
		const block: TextBlock = { id, x: a.sx * p.x + a.tx, w: a.sx * width, align: leaf.align };
		const clip = clipOf(leaf.node);
		// Scaled text is drawn at the scaled size.
		const scaled = (st: InlineStyle): InlineStyle =>
			a.sy === 1 && a.sx === 1
				? st
				: {
						...st,
						size: st.size * a.sy,
						lineHeight: st.lineHeight * a.sy,
						letterSpacing: st.letterSpacing * a.sx,
					};
		for (const f of r.fragments)
			lines.push(
				mapRect(a, {
					text: f.text,
					x: p.x + f.x,
					y: p.y + f.y,
					w: f.w,
					h: f.h,
					style: scaled(f.style),
					clip,
					block,
					line: f.line,
					lineTop: a.sy * (p.y + f.lineTop) + a.ty,
					lineHeight: a.sy * f.lineHeight,
				}),
			);
		for (const ib of r.inlineBoxes) {
			const entry = b.ctx.inlineEls[ib.id];
			if (!entry) continue;
			const is = b.inlineStyle(entry.style);
			const m = verticalMetrics(is.face, is.size);
			const v = (prop: string) => {
				const n = b.px(entry.style, prop);
				return Number.isNaN(n) ? 0 : n;
			};
			const top = v("padding-top") + v("border-top-width");
			const bottom = v("padding-bottom") + v("border-bottom-width");
			inlineBoxes.push(
				mapRect(a, {
					eid: b.ctx.eids.get(entry.el) ?? -1,
					tag: entry.el.name,
					x: p.x + ib.x,
					y: p.y + ib.baseline - m.ascent - top,
					w: ib.w,
					h: m.ascent + m.descent + top + bottom,
					style: entry.style,
					alpha: is.alpha,
					clip,
				}),
			);
		}
	}
	const markers = listMarkers(b.ctx, boxes, lines, sheets, fonts);
	const tables: TableBox[] = b.tables.map((t) => {
		const p = b.absolute(t.node);
		const columns: number[] = [];
		const rows = t.rows.map((r) => {
			const rp = b.absolute(r.node);
			const ra = b.affineOf(r.node);
			return {
				eid: r.eid,
				y: ra.sy * rp.y + ra.ty,
				h: ra.sy * r.node.getComputedHeight(),
				cells: r.cells.map((c) => {
					const cp = b.absolute(c.node);
					const ca = b.affineOf(c.node);
					const w = ca.sx * c.node.getComputedWidth();
					if (c.span === 1) columns[c.col] = w;
					const sides = (get: (e: Edge) => number): Sides => ({
						top: get(Edge.Top),
						right: get(Edge.Right),
						bottom: get(Edge.Bottom),
						left: get(Edge.Left),
					});
					return {
						eid: c.eid,
						col: c.col,
						span: c.span,
						x: ca.sx * cp.x + ca.tx,
						y: ca.sy * cp.y + ca.ty,
						w,
						h: ca.sy * c.node.getComputedHeight(),
						style: c.style,
						padding: sides((e) => c.node.getComputedPadding(e)),
						border: sides((e) => c.node.getComputedBorder(e)),
					};
				}),
			};
		});
		const ta = b.affineOf(t.node);
		return {
			eid: t.eid,
			x: ta.sx * p.x + ta.tx,
			y: ta.sy * p.y + ta.ty,
			w: ta.sx * t.node.getComputedWidth(),
			h: ta.sy * t.node.getComputedHeight(),
			columns: [...columns].map((w) => w ?? 0),
			rows,
		};
	});
	return {
		width: root.getComputedWidth(),
		height: root.getComputedHeight(),
		style: slideStyle,
		boxes,
		inlineBoxes,
		lines,
		markers,
		tables,
		elements: [...b.ctx.eids.keys()],
	};
}

const MARKERS: Record<string, string> = { disc: "•", circle: "◦", square: "▪" };

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
 * A slide laid out by the constraint-based core (flow.ts), read back as the
 * same boxes, lines, inline boxes, markers and tables as {@link layoutSlide}.
 * Output order is the box tree's (paint order), as before.
 */
function flowLayout(
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
	const root = flow.layout(tree, {
		available: vp.width,
		pctW: vp.width,
		pctH: vp.height,
		...(auto("width") ? { width: vp.width } : {}),
		...(auto("height") ? { height: vp.height } : {}),
	});
	// The slide is the containing block of what's still positioned against nothing.
	const rootBorder = flow.edges(slideStyle).border;
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
			return;
		}
		const { style } = f.box;
		let a = outer;
		const transform = style.get("transform");
		if (transform && transform !== "none") {
			const fs = Number.parseFloat(style.get("font-size") ?? "16");
			const own = boxTransform(
				transform,
				style.get("transform-origin") ?? "",
				{ x, y, w: f.w, h: f.h },
				(v, basis) => toPx(v, fs, ctx.rootFontSize, vp, basis),
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
		const row = f.box.el.name === "tr" || (style.get("display") ?? "") === "table-row";
		// Table rows are listed with their table (rowBoxes), the rest by box.
		if (!row) placedBox.set(f.box, box);
		if (f.box.kind === "table") tableFrags.set(f.box, { f, x, y, a });
		if (row) rowBoxes.set(f.box.eid, box);
		let inner = clip;
		const o = `${style.get("overflow") ?? ""} ${style.get("overflow-x") ?? ""} ${style.get("overflow-y") ?? ""}`;
		if (/hidden|clip|auto|scroll/.test(o)) {
			const { border } = new Flow(ctx).edges(style);
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
	walk(root, 0, 0, undefined, IDENTITY);

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
			if (c.type === "text") emitText(c);
			else emit(c, false);
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
				const { padding, border } = new Flow(ctx).edges(cb.style, ck.f.w);
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
		boxes,
		inlineBoxes,
		lines,
		markers,
		tables,
		elements: [...ctx.eids.keys()],
	};
}
