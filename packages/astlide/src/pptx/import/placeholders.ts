/**
 * Placeholders: a shape's placeholder, and the layout and master shapes it
 * inherits position and text style from.
 *
 * @module
 */

import { type Element, kids, path } from "../ooxml/xml";
import type { SlideContext } from "./presentation";

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
