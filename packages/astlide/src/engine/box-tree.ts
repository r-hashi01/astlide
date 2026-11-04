/**
 * The box tree: which elements make boxes, how each lays out its children
 * (block flow, flex, grid, table, or a picture of its own size), and the runs
 * of inline content between them — from the DOM and the computed styles,
 * before any sizes are known. Layout works on this tree.
 */

import { type ChildNode, Element, Text } from "domhandler";
import { type Computed, computeStyle, type StyleSheets, toPx, type Viewport } from "./cascade";
import { type FontRegistry, type InlineItem, type InlineStyle, verticalMetrics } from "./text";

/** Tag of the synthetic elements that stand for `::before` / `::after`. */
export const PSEUDO_TAG = "astlide-pseudo";

/** How a box lays out its children. */
export type BoxKind = "block" | "flex" | "grid" | "table" | "replaced";

/** A box an element makes. */
export interface ElementBox {
	type: "element";
	el: Element;
	style: Computed;
	eid: number;
	kind: BoxKind;
	/** It establishes a block formatting context: its children's margins don't collapse through it. */
	bfcRoot: boolean;
	/** In-flow and positioned children, and runs of inline content, in tree order. */
	children: (ElementBox | TextRun)[];
	/** A table's rows (header rows first, footer rows last). */
	rows?: TableRow[];
}

/** A run of inline content: one block of lines, or an anonymous flex / grid item. */
export interface TextRun {
	type: "text";
	items: InlineItem[];
	/** The container's own inline style (the minimum line height). */
	strut: InlineStyle;
	align: string;
	/** A run in block flow (its lines don't shrink), not an anonymous flex / grid item. */
	inFlow: boolean;
}

export interface TableRow {
	el: Element;
	style: Computed;
	eid: number;
	cells: { box: ElementBox; span: number }[];
}

/**
 * The text a `content` value generates: strings (with CSS escapes) and
 * `attr()`; counters and quotes give nothing. `none` / `normal` / unset: no box.
 */
function generatedContent(value: string | undefined, el: Element): string | null {
	const v = value?.trim();
	if (!v || v === "none" || v === "normal") return null;
	let out = "";
	for (const m of v.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|attr\(\s*([\w-]+)\s*\)/g)) {
		if (m[3]) out += el.attribs[m[3]] ?? "";
		else
			out += (m[1] ?? m[2] ?? "").replace(
				/\\([0-9a-f]{1,6})\s?|\\(.)/gi,
				(_, hex: string, ch: string) => (hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : ch),
			);
	}
	return out;
}

export const isElement = (n: ChildNode): n is Element =>
	n.type === "tag" || n.type === "script" || n.type === "style";
export const isText = (n: ChildNode): n is Text => n.type === "text";

/** Text as `text-transform` shows it. */
export function transformText(text: string, transform: string | undefined): string {
	switch (transform) {
		case "uppercase":
			return text.toUpperCase();
		case "lowercase":
			return text.toLowerCase();
		case "capitalize":
			return text.replace(
				/(^|[^\p{L}\p{N}'’])(\p{L})/gu,
				(_, before, ch) => before + ch.toUpperCase(),
			);
		default:
			return text;
	}
}

const INLINE = new Set(["inline", "inline-block", "inline-flex", "contents"]);

/** Computed styles, element ids and inline content of one slide's elements. */
export class StyleContext {
	readonly styles = new Map<Element, Computed>();
	readonly eids = new Map<Element, number>();
	/** Inline elements by inline-box id (backgrounds / borders across lines). */
	readonly inlineEls: { el: Element; style: Computed }[] = [];
	rootFontSize = 16;
	private readonly pseudoKids = new Map<Element, ChildNode[]>();

	constructor(
		readonly sheets: StyleSheets,
		readonly fonts: FontRegistry,
		readonly vp: Viewport,
	) {}

	styleOf(el: Element, parent: Computed | null): Computed {
		const hit = this.styles.get(el);
		if (hit) return hit;
		const s = computeStyle(this.sheets.declared(el), {
			parent,
			rootFontSize: this.rootFontSize,
			vp: this.vp,
		});
		// Underline / line-through propagate to everything inside (text-decoration isn't inherited, but paints through).
		const deco = `${s.get("text-decoration-line") ?? ""} ${s.get("text-decoration") ?? ""}`;
		const lines = new Set((parent?.get("__decoration") ?? "").split(" ").filter(Boolean));
		if (/\bunderline\b/.test(deco)) lines.add("underline");
		if (/\bline-through\b/.test(deco)) lines.add("line-through");
		s.set("__decoration", [...lines].join(" "));
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
		const { face, requested } = this.fonts.resolve(
			style.get("font-family") ?? "serif",
			weight,
			italic,
		);
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
			requested,
			size,
			lineHeight,
			letterSpacing: ls === "normal" ? 0 : Number.parseFloat(ls) || 0,
			whiteSpace: style.get("white-space") ?? "normal",
			color: style.get("color") ?? "#000",
			alpha,
			breakWord:
				/break-word|anywhere/.test(
					`${style.get("overflow-wrap") ?? ""} ${style.get("word-wrap") ?? ""}`,
				) || style.get("word-break") === "break-all",
			underline: /underline/.test(style.get("__decoration") ?? ""),
			strike: /line-through/.test(style.get("__decoration") ?? ""),
		};
	}

	/**
	 * An element's children plus its `::before` / `::after` boxes, as
	 * synthetic elements holding their generated text, when `content` makes
	 * them exist.
	 */
	childrenOf(el: Element, style: Computed): ChildNode[] {
		const hit = this.pseudoKids.get(el);
		if (hit) return hit;
		const out: ChildNode[] = [...el.children];
		if (el.name !== PSEUDO_TAG) {
			for (const which of ["before", "after"] as const) {
				const declared = this.sheets.declared(el, which);
				const text = generatedContent(declared.get("content"), el);
				if (text === null) continue;
				const p = new Element(PSEUDO_TAG, {});
				if (text) {
					const t = new Text(text);
					t.parent = p;
					p.children = [t];
				}
				p.parent = el;
				const s = computeStyle(declared, {
					parent: style,
					rootFontSize: this.rootFontSize,
					vp: this.vp,
				});
				const opacity = Number.parseFloat(s.get("opacity") ?? "1");
				s.set(
					"__alpha",
					String(Number(style.get("__alpha") ?? 1) * (Number.isNaN(opacity) ? 1 : opacity)),
				);
				this.styles.set(p, s);
				if (which === "before") out.unshift(p);
				else out.push(p);
			}
		}
		this.pseudoKids.set(el, out);
		return out;
	}

	/** Collect inline content (text + inline element edges) under `nodes`. */
	collectInline(nodes: ChildNode[], parentStyle: Computed, items: InlineItem[]): void {
		for (const n of nodes) {
			if (isText(n)) {
				items.push({
					kind: "text",
					text: transformText(n.data, parentStyle.get("text-transform")),
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
				this.collectInline(this.childrenOf(n, s), s, items);
				const ir = sum("border-right-width", "padding-right");
				if (ir) items.push({ kind: "space", width: ir });
				items.push({ kind: "close", id });
				const mr = sum("margin-right");
				if (mr) items.push({ kind: "space", width: mr });
			}
		}
	}

	isInlineLevel(n: ChildNode, parentStyle: Computed): boolean {
		if (isText(n)) return true;
		if (!isElement(n)) return false;
		// Replaced elements aren't laid out inline (no atomic inlines yet): their own box.
		if (n.name === "img" || n.name === "svg" || n.name === "iframe") return false;
		return INLINE.has(this.styleOf(n, parentStyle).get("display") ?? "inline") || n.name === "br";
	}

	/** A run of inline content under a container with `style`. */
	textRun(nodes: ChildNode[], style: Computed, inFlow: boolean): TextRun {
		const items: InlineItem[] = [];
		this.collectInline(nodes, style, items);
		// Number text items in order: each text node keeps its own fragments.
		let k = 0;
		for (const it of items) if (it.kind === "text" && it.nodeIndex !== -1) it.nodeIndex = k++;
		return {
			type: "text",
			items,
			strut: this.inlineStyle(style),
			align: style.get("text-align") ?? "start",
			inFlow,
		};
	}

	/**
	 * The box `el` makes and its subtree, or null for `display: none`.
	 * `bfcRoot`: it establishes its own block formatting context.
	 */
	box(el: Element, style: Computed, bfcRoot = true): ElementBox | null {
		const display = style.get("display") ?? "inline";
		if (display === "none") return null;
		const eid = this.eids.get(el) ?? -1;
		const box = (kind: BoxKind): ElementBox => ({
			type: "element",
			el,
			style,
			eid,
			kind,
			bfcRoot,
			children: [],
		});
		// Pictures of their own size; an inline SVG's content is drawn as a whole (see toScene).
		if (el.name === "img" || el.name === "svg" || el.name === "iframe") return box("replaced");
		if (display === "table" || display === "inline-table") return this.table(box("table"));

		const kind: BoxKind =
			display === "flex" || display === "inline-flex"
				? "flex"
				: display === "grid"
					? "grid"
					: "block";
		const out = box(kind);
		const container = kind !== "block";
		let run: ChildNode[] = [];
		const flushInline = () => {
			const pre = /pre/.test(style.get("white-space") ?? "");
			if (run.some((n) => !isText(n) || pre || n.data.trim() !== ""))
				out.children.push(this.textRun(run, style, true));
			run = [];
		};
		for (const child of this.childrenOf(el, style)) {
			if (isText(child)) {
				// In flex / grid containers each text run is its own anonymous item.
				if (container) {
					if (child.data.trim()) out.children.push(this.textRun([child], style, false));
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
			const c = this.box(child, cs, childBfc);
			if (c) out.children.push(c);
		}
		flushInline();
		return out;
	}

	/** A table's rows of cells: header rows first, footer rows last. */
	private table(box: ElementBox): ElementBox {
		const rows: [Element, Computed][] = [];
		const footers: [Element, Computed][] = [];
		const visit = (parent: Element, ps: Computed, footer: boolean) => {
			for (const c of parent.children) {
				if (!isElement(c)) continue;
				const cs = this.styleOf(c, ps);
				const d = cs.get("display") ?? "inline";
				if (d === "table-row") (footer ? footers : rows).push([c, cs]);
				else if (d === "table-header-group") {
					const head: [Element, Computed][] = [];
					const before = rows.length;
					visit(c, cs, false);
					head.push(...rows.splice(before));
					rows.unshift(...head);
				} else if (d === "table-row-group") visit(c, cs, footer);
				else if (d === "table-footer-group") visit(c, cs, true);
			}
		};
		visit(box.el, box.style, false);
		box.rows = [...rows, ...footers].map(([r, rs]) => {
			const cells: TableRow["cells"] = [];
			for (const c of r.children) {
				if (!isElement(c)) continue;
				const cs = this.styleOf(c, rs);
				if ((cs.get("display") ?? "") !== "table-cell") continue;
				const cell = this.box(c, cs, true);
				if (!cell) continue;
				cells.push({
					box: cell,
					span: Math.max(1, Number.parseInt(c.attribs.colspan ?? "1", 10) || 1),
				});
			}
			return { el: r, style: rs, eid: this.eids.get(r) ?? -1, cells };
		});
		return box;
	}
}
