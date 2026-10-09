/**
 * @astlide/engine — lay out HTML + CSS slides without a browser (spike).
 *
 * Pipeline: HTML (htmlparser2) → cascade (cascade.ts) → Yoga box layout +
 * font-metric line breaking (layout.ts, text.ts) → boxes and text lines in
 * slide coordinates.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Element } from "domhandler";
import { parseDocument } from "htmlparser2";
import { StyleSheets, UA_CSS, type Viewport } from "./cascade";
import { layoutSlide, type SlideLayout } from "./layout";
import type { FontRegistry } from "./text";

export type { Box, SlideLayout, TextLine } from "./layout";
export { FontRegistry } from "./text";

function* elements(node: { children?: unknown[] }): Generator<Element> {
	for (const c of (node.children ?? []) as Element[]) {
		if (c.type === "tag" || c.type === "style" || c.type === "script") {
			yield c;
			yield* elements(c);
		}
	}
}

/** Lay out every `body > .slide` of a built page (e.g. dist/<deck>/all/index.html). */
export function layoutPage(
	htmlPath: string,
	distDir: string,
	fonts: FontRegistry,
	vp: Viewport,
): SlideLayout[] {
	const doc = parseDocument(readFileSync(htmlPath, "utf-8"));
	const sheets = new StyleSheets(vp);
	sheets.add(UA_CSS, 0);
	for (const el of elements(doc)) {
		if (el.name === "link" && el.attribs.rel === "stylesheet" && el.attribs.href?.startsWith("/")) {
			sheets.add(readFileSync(join(distDir, el.attribs.href), "utf-8"));
		} else if (el.name === "style") {
			sheets.add(el.children.map((c) => ("data" in c ? c.data : "")).join(""));
		}
	}
	const all = [...elements(doc)];
	const html = all.find((e) => e.name === "html");
	const body = all.find((e) => e.name === "body");
	if (!html || !body) throw new Error("no <html>/<body>");
	const slides = body.children.filter(
		(c): c is Element => c.type === "tag" && (c.attribs.class ?? "").split(/\s+/).includes("slide"),
	);
	return slides.map((s) => layoutSlide(s, [html, body], sheets, fonts, vp));
}
