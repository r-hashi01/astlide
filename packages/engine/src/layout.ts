/**
 * Box layout: map computed styles onto a Yoga tree (block flow as a column
 * flexbox, flex as flex, equal-column grids) with inline formatting contexts
 * as measured leaves, then read back absolute boxes and text lines.
 */

import type { ChildNode, Element, Text } from "domhandler";
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
import { type Computed, computeStyle, type StyleSheets, toPx, type Viewport } from "./cascade";
import {
	type FontRegistry,
	type InlineItem,
	type InlineStyle,
	layoutLines,
	verticalMetrics,
} from "./text";

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
	/** Slide descendants by element id (document order). */
	elements: Element[];
}

const isElement = (n: ChildNode): n is Element =>
	n.type === "tag" || n.type === "script" || n.type === "style";
const isText = (n: ChildNode): n is Text => n.type === "text";
const INLINE = new Set(["inline", "inline-block", "inline-flex", "contents"]);
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
	gridCols?: number;
	gridGap?: number;
}

class Builder {
	readonly styles = new Map<Element, Computed>();
	readonly eids = new Map<Element, number>();
	readonly leaves: Leaf[] = [];
	readonly boxNodes: BoxNode[] = [];
	rootFontSize = 16;
	readonly config = Yoga.Config.create();
	/** Parent of each node we created (Yoga's getParent/getChild return fresh wrappers). */
	readonly parents = new Map<YogaNode, YogaNode>();
	/** Inline elements by inline-box id (backgrounds / borders across lines). */
	readonly inlineEls: { el: Element; style: Computed }[] = [];
	/** Resolved vertical margins of block boxes (px), for margin collapsing. */
	readonly margins = new Map<YogaNode, { top: number; bottom: number }>();

	private add(parent: YogaNode, child: YogaNode): void {
		parent.insertChild(child, parent.getChildCount());
		this.parents.set(child, parent);
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
		this.config.setUseWebDefaults(true);
		this.config.setPointScaleFactor(64);
	}

	styleOf(el: Element, parent: Computed | null): Computed {
		const hit = this.styles.get(el);
		if (hit) return hit;
		const s = computeStyle(this.sheets.declared(el), {
			parent,
			rootFontSize: this.rootFontSize,
			vp: this.vp,
		});
		// Effective opacity: not inherited, but multiplies down the tree.
		const opacity = Number.parseFloat(s.get("opacity") ?? "1");
		s.set(
			"__alpha",
			String(Number(parent?.get("__alpha") ?? 1) * (Number.isNaN(opacity) ? 1 : opacity)),
		);
		this.styles.set(el, s);
		return s;
	}

	/** A length in px, or NaN for keywords. */
	px(style: Computed, prop: string, basis = Number.NaN): number {
		const fs = Number.parseFloat(style.get("font-size") ?? "16");
		return toPx(style.get(prop) ?? "", fs, this.rootFontSize, this.vp, basis);
	}

	inlineStyle(style: Computed): InlineStyle {
		const alpha =
			(style.get("visibility") ?? "visible") === "hidden" ? 0 : Number(style.get("__alpha") ?? 1);
		const size = Number.parseFloat(style.get("font-size") ?? "16");
		const weight = Number.parseInt(style.get("font-weight") ?? "400", 10) || 400;
		const italic = /italic|oblique/.test(style.get("font-style") ?? "");
		const face = this.fonts.pick(style.get("font-family") ?? "serif", weight, italic);
		const lh = style.get("line-height") ?? "normal";
		let lineHeight: number;
		if (lh === "normal") {
			const m = verticalMetrics(face, size);
			lineHeight = m.ascent + m.descent + m.lineGap;
		} else if (/^[\d.]+$/.test(lh)) lineHeight = Number(lh) * size;
		else lineHeight = Number.parseFloat(lh);
		const ls = style.get("letter-spacing") ?? "normal";
		return {
			face,
			size,
			lineHeight,
			letterSpacing: ls === "normal" ? 0 : Number.parseFloat(ls) || 0,
			whiteSpace: style.get("white-space") ?? "normal",
			color: style.get("color") ?? "#000",
			alpha,
		};
	}

	private setLength(style: Computed, prop: string, set: (v: number | `${number}%`) => void): void {
		const raw = (style.get(prop) ?? "auto").trim();
		if (raw === "auto" || raw === "none" || raw === "" || raw === "normal" || /content/.test(raw))
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
		if (style.get("position") === "absolute") {
			node.setPositionType(PositionType.Absolute);
			for (const [side, edge] of EDGES)
				this.setLength(style, side, (v) => node.setPosition(edge, v));
		}
		const grow = Number(style.get("flex-grow") ?? 0);
		const shrink = Number(style.get("flex-shrink") ?? 1);
		node.setFlexGrow(Number.isNaN(grow) ? 0 : grow);
		node.setFlexShrink(Number.isNaN(shrink) ? 1 : shrink);
		this.setLength(style, "flex-basis", (v) => node.setFlexBasis(v));
		const alignSelf = style.get("align-self");
		if (alignSelf && alignSelf !== "auto") node.setAlignSelf(alignOf(alignSelf));
	}

	/** Collect inline content (text + inline element edges) under `nodes`. */
	private collectInline(nodes: ChildNode[], parentStyle: Computed, items: InlineItem[]): void {
		for (const n of nodes) {
			if (isText(n)) {
				items.push({
					kind: "text",
					text: n.data,
					style: this.inlineStyle(parentStyle),
					nodeIndex: 0,
				});
			} else if (isElement(n)) {
				const s = this.styleOf(n, parentStyle);
				if (s.get("display") === "none") continue;
				if (n.name === "br") {
					items.push({
						kind: "text",
						text: "\n",
						style: { ...this.inlineStyle(s), whiteSpace: "pre-line" },
						nodeIndex: -1,
					});
					continue;
				}
				const sum = (...props: string[]) =>
					props.reduce((acc, p) => {
						const v = this.px(s, p);
						return acc + (Number.isNaN(v) ? 0 : v);
					}, 0);
				const id = this.inlineEls.length;
				this.inlineEls.push({ el: n, style: s });
				// margin | open … border + padding | content | border + padding … close | margin
				const ml = sum("margin-left");
				if (ml) items.push({ kind: "space", width: ml });
				items.push({ kind: "open", id });
				const il = sum("border-left-width", "padding-left");
				if (il) items.push({ kind: "space", width: il });
				this.collectInline(n.children, s, items);
				const ir = sum("border-right-width", "padding-right");
				if (ir) items.push({ kind: "space", width: ir });
				items.push({ kind: "close", id });
				const mr = sum("margin-right");
				if (mr) items.push({ kind: "space", width: mr });
			}
		}
	}

	private inlineLeaf(nodes: ChildNode[], containerStyle: Computed): YogaNode {
		const items: InlineItem[] = [];
		this.collectInline(nodes, containerStyle, items);
		// Number text items in order: each text node keeps its own fragments.
		let k = 0;
		for (const it of items) if (it.kind === "text" && it.nodeIndex !== -1) it.nodeIndex = k++;
		const strut = this.inlineStyle(containerStyle);
		const node = Yoga.Node.create(this.config);
		node.setMeasureFunc((width, widthMode) => {
			const max = widthMode === MeasureMode.Undefined ? Number.POSITIVE_INFINITY : width;
			const r = layoutLines(items, max, strut, "left", this.fonts);
			return {
				width: widthMode === MeasureMode.Exactly ? width : Math.min(r.width, max),
				height: r.height,
			};
		});
		this.leaves.push({ node, items, strut, align: containerStyle.get("text-align") ?? "start" });
		return node;
	}

	private isInlineLevel(n: ChildNode, parentStyle: Computed): boolean {
		if (isText(n)) return true;
		if (!isElement(n)) return false;
		return INLINE.has(this.styleOf(n, parentStyle).get("display") ?? "inline") || n.name === "br";
	}

	/**
	 * @param bfcRoot - The element establishes its own block formatting context
	 *   (root, flex / grid item, overflow ≠ visible …): child margins don't collapse through it.
	 */
	build(el: Element, style: Computed, bfcRoot = true): YogaNode | null {
		const display = style.get("display") ?? "inline";
		if (display === "none") return null;
		const node = Yoga.Node.create(this.config);
		this.applyBox(node, style);

		const isFlex = display === "flex" || display === "inline-flex";
		const isGrid = display === "grid";
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
			node.setFlexWrap(/wrap/.test(style.get("flex-wrap") ?? "") ? Wrap.Wrap : Wrap.NoWrap);
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

		let gridCols = 0;
		if (isGrid) {
			const t = style.get("grid-template-columns") ?? "none";
			const rep = t.match(/repeat\(\s*(\d+)\s*,\s*1fr\s*\)/);
			gridCols = rep ? Number(rep[1]) : (t.match(/1fr/g) ?? []).length || 1;
		}

		const container = isFlex || isGrid;
		let run: ChildNode[] = [];
		const flushInline = () => {
			const pre = /pre/.test(style.get("white-space") ?? "");
			if (run.some((n) => !isText(n) || pre || n.data.trim() !== "")) {
				this.add(node, this.inlineLeaf(run, style));
			}
			run = [];
		};
		for (const child of el.children) {
			if (isText(child)) {
				// In flex / grid containers each text run is its own anonymous item.
				if (container) {
					if (child.data.trim()) this.add(node, this.inlineLeaf([child], style));
				} else run.push(child);
				continue;
			}
			if (!isElement(child)) continue;
			if (!container && this.isInlineLevel(child, style)) {
				run.push(child);
				continue;
			}
			flushInline();
			const cs = this.styleOf(child, style);
			const childDisplay = cs.get("display") ?? "block";
			const childBfc =
				container ||
				(cs.get("overflow") ?? "visible") !== "visible" ||
				["flow-root", "inline-block", "flex", "grid", "inline-flex", "table"].includes(
					childDisplay,
				) ||
				cs.get("position") === "absolute";
			const yn = this.build(child, cs, childBfc);
			if (!yn) continue;
			// width: fit-content / max-content in a column: size to content instead of stretching.
			const w = (cs.get("width") ?? "auto").trim();
			const stretches =
				!container || (style.get("align-items") ?? "stretch").match(/^(stretch|normal)$/);
			const column = !container || /column/.test(style.get("flex-direction") ?? "row");
			if (
				/^(fit-content|max-content|min-content)$/.test(w) &&
				stretches &&
				column &&
				!cs.get("align-self")?.match(/center|end|start/)
			) {
				yn.setAlignSelf(Align.FlexStart);
			}
			const entry: BoxNode = { node: yn, el: child, style: cs, eid: this.eids.get(child) ?? -1 };
			if (gridCols > 0) {
				yn.setFlexGrow(0);
				yn.setFlexShrink(0);
				entry.gridCols = gridCols;
				entry.gridGap = Number.isNaN(cg) ? 0 : cg;
			}
			this.add(node, yn);
			this.boxNodes.push(entry);
		}
		flushInline();
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
): SlideLayout {
	const b = new Builder(sheets, fonts, vp);
	let parent: Computed | null = null;
	for (const a of ancestors) {
		parent = b.styleOf(a, parent);
		if (a.name === "html") b.rootFontSize = Number.parseFloat(parent.get("font-size") ?? "16");
	}
	// Element ids in document order (matches querySelectorAll("*") in the slide).
	let next = 0;
	const number = (el: Element) => {
		for (const c of el.children) {
			if (isElement(c)) {
				b.eids.set(c, next++);
				number(c);
			}
		}
	};
	number(slide);

	const slideStyle = b.styleOf(slide, parent);
	const root = b.build(slide, slideStyle);
	if (!root)
		return {
			width: 0,
			height: 0,
			style: slideStyle,
			boxes: [],
			inlineBoxes: [],
			lines: [],
			markers: [],
			elements: [],
		};
	if ((slideStyle.get("width") ?? "auto") === "auto") root.setWidth(vp.width);
	if ((slideStyle.get("height") ?? "auto") === "auto") root.setHeight(vp.height);

	root.calculateLayout(vp.width, vp.height, Direction.LTR);
	// Grid items: (container content width − gaps) / columns, once the width is known.
	let changed = false;
	for (const bn of b.boxNodes) {
		if (!bn.gridCols) continue;
		const p = b.parents.get(bn.node);
		if (!p) continue;
		const inner =
			p.getComputedWidth() -
			p.getComputedPadding(Edge.Left) -
			p.getComputedPadding(Edge.Right) -
			p.getComputedBorder(Edge.Left) -
			p.getComputedBorder(Edge.Right);
		bn.node.setWidth((inner - (bn.gridCols - 1) * (bn.gridGap ?? 0)) / bn.gridCols);
		changed = true;
	}
	if (changed) root.calculateLayout(vp.width, vp.height, Direction.LTR);

	const boxes: Box[] = [];
	for (const bn of b.boxNodes) {
		const p = b.absolute(bn.node);
		boxes.push({
			eid: bn.eid,
			tag: bn.el.name,
			x: p.x,
			y: p.y,
			w: bn.node.getComputedWidth(),
			h: bn.node.getComputedHeight(),
			style: bn.style,
			alpha: Number(bn.style.get("__alpha") ?? 1),
		});
	}
	const lines: TextLine[] = [];
	const inlineBoxes: InlineBox[] = [];
	for (const [id, leaf] of b.leaves.entries()) {
		const p = b.absolute(leaf.node);
		const width = leaf.node.getComputedWidth();
		const r = layoutLines(leaf.items, width, leaf.strut, leaf.align, fonts);
		const block: TextBlock = { id, x: p.x, w: width, align: leaf.align };
		for (const f of r.fragments)
			lines.push({
				text: f.text,
				x: p.x + f.x,
				y: p.y + f.y,
				w: f.w,
				h: f.h,
				style: f.style,
				block,
				line: f.line,
				lineTop: p.y + f.lineTop,
				lineHeight: f.lineHeight,
			});
		for (const ib of r.inlineBoxes) {
			const entry = b.inlineEls[ib.id];
			if (!entry) continue;
			const is = b.inlineStyle(entry.style);
			const m = verticalMetrics(is.face, is.size);
			const v = (prop: string) => {
				const n = b.px(entry.style, prop);
				return Number.isNaN(n) ? 0 : n;
			};
			const top = v("padding-top") + v("border-top-width");
			const bottom = v("padding-bottom") + v("border-bottom-width");
			inlineBoxes.push({
				eid: b.eids.get(entry.el) ?? -1,
				tag: entry.el.name,
				x: p.x + ib.x,
				y: p.y + ib.baseline - m.ascent - top,
				w: ib.w,
				h: m.ascent + m.descent + top + bottom,
				style: entry.style,
				alpha: is.alpha,
			});
		}
	}
	const markers = listMarkers(b, boxes, lines, sheets, fonts);
	return {
		width: root.getComputedWidth(),
		height: root.getComputedHeight(),
		style: slideStyle,
		boxes,
		inlineBoxes,
		lines,
		markers,
		elements: [...b.eids.keys()],
	};
}

const MARKERS: Record<string, string> = { disc: "•", circle: "◦", square: "▪" };

/** Outside list markers: text ends at the item's border-box start, on its first baseline. */
function listMarkers(
	b: Builder,
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
		const el = [...b.eids].find(([, id]) => id === box.eid)?.[0];
		if (!el) continue;
		const n = (counters.get(el.parent as Element | null) ?? 0) + 1;
		counters.set(el.parent as Element | null, n);
		const text = MARKERS[type] ?? (type === "decimal" ? `${n}.` : "•");
		const ms = computeStyle(sheets.declared(el, "marker"), {
			parent: box.style,
			rootFontSize: b.rootFontSize,
			vp: b.vp,
		});
		ms.set("__alpha", box.style.get("__alpha") ?? "1");
		const style = b.inlineStyle(ms);
		const first = lines.find((l) => l.y >= box.y - 1 && l.y < box.y + box.h);
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
