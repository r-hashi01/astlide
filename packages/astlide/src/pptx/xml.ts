/**
 * Small helpers over a parsed XML tree (htmlparser2 in XML mode): qualified
 * names are kept as written ("p:sp", "a:rPr").
 *
 * @module
 */

import type { ChildNode, Element } from "domhandler";
import { parseDocument } from "htmlparser2";

export type { Element };

const isElement = (n: ChildNode): n is Element => n.type === "tag";

/** Deepest element nesting accepted (the helpers below recurse; real files stay far below). */
export const MAX_XML_DEPTH = 256;

/** Parse XML; returns its root element. Throws on nesting deeper than {@link MAX_XML_DEPTH}. */
export function parseXml(xml: string): Element {
	const root = parseDocument(xml, { xmlMode: true }).children.find(isElement);
	if (!root) throw new Error("empty XML document");
	// Checked without recursion, so a hostile file fails here rather than overflowing the stack later.
	const stack: [Element, number][] = [[root, 1]];
	for (let next = stack.pop(); next; next = stack.pop()) {
		const [el, depth] = next;
		if (depth > MAX_XML_DEPTH) throw new Error("XML nested too deeply");
		for (const c of el.children) if (isElement(c)) stack.push([c, depth + 1]);
	}
	return root;
}

/** Child elements, optionally only those named `name`. */
export function kids(el: Element | undefined, name?: string): Element[] {
	if (!el) return [];
	return el.children.filter((c): c is Element => isElement(c) && (!name || c.name === name));
}

/** First child element named `name`. */
export function kid(el: Element | undefined, name: string): Element | undefined {
	return el?.children.find((c): c is Element => isElement(c) && c.name === name);
}

/** Follow a path of child names ("p:cSld", "p:spTree"). */
export function path(el: Element | undefined, ...names: string[]): Element | undefined {
	let cur = el;
	for (const n of names) cur = kid(cur, n);
	return cur;
}

/** First descendant named `name` (depth-first). */
export function find(el: Element | undefined, name: string): Element | undefined {
	if (!el) return undefined;
	for (const c of kids(el)) {
		if (c.name === name) return c;
		const deep = find(c, name);
		if (deep) return deep;
	}
	return undefined;
}

/** A numeric attribute, or `fallback`. */
export function num(el: Element | undefined, name: string, fallback = 0): number {
	const v = el?.attribs[name];
	if (v === undefined) return fallback;
	const n = Number(v);
	return Number.isNaN(n) ? fallback : n;
}

/** All text below an element (a:t runs joined). */
export function textOf(el: Element | undefined): string {
	if (!el) return "";
	let out = "";
	for (const c of el.children) {
		if (c.type === "text") out += c.data;
		else if (isElement(c)) out += textOf(c);
	}
	return out;
}
