/**
 * @astlide/engine — lay out HTML + CSS slides without a browser (spike).
 *
 * Pipeline: HTML (htmlparser2) → cascade (cascade.ts) → Yoga box layout +
 * font-metric line breaking (layout.ts, text.ts) → boxes and text lines in
 * slide coordinates.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Element } from "domhandler";
import { parseDocument } from "htmlparser2";
import { StyleSheets, UA_CSS, type Viewport } from "./cascade";
import {
	type Box,
	intersect,
	layoutSlide,
	type Rect,
	type SlideLayout,
	type TextBlock,
	type TextLine,
} from "./layout";
import type { FontRegistry } from "./text";

export {
	type MermaidOptions,
	type RenderedDiagram,
	renderMermaid,
	resolveEsm,
	svgToPng,
} from "./diagrams";
export { familiesIn, loadFontFaces, loadGoogleFonts } from "./fonts";
export type { Box, Rect, SlideLayout, TableBox, TableCellBox, TextLine } from "./layout";
export { intersect, transformText } from "./layout";
export {
	type Color,
	type Gradient,
	parseColor,
	parseLinearGradient,
	parseStripes,
	type Scene,
	type SceneItem,
	type Stripes,
	toScene,
} from "./scene";
export { FontRegistry } from "./text";

function* elements(node: { children?: unknown[] }): Generator<Element> {
	for (const c of (node.children ?? []) as Element[]) {
		if (c.type === "tag" || c.type === "style" || c.type === "script") {
			yield c;
			yield* elements(c);
		}
	}
}

/** All CSS a built page uses (linked sheets + <style> blocks), in order. */
export function pageCss(htmlPath: string, distDir: string): string {
	const doc = parseDocument(readFileSync(htmlPath, "utf-8"));
	const parts: string[] = [];
	for (const el of elements(doc)) {
		if (el.name === "link" && el.attribs.rel === "stylesheet" && el.attribs.href?.startsWith("/")) {
			parts.push(readFileSync(join(distDir, el.attribs.href), "utf-8"));
		} else if (el.name === "style") {
			parts.push(el.children.map((c) => ("data" in c ? c.data : "")).join(""));
		}
	}
	return parts.join("\n");
}

/** Parse markup (e.g. a scene item's SVG) as XML into a DOM. */
export function parseMarkup(markup: string) {
	return parseDocument(markup, { xmlMode: true });
}

/** Lay out every `body > .slide` of a built page (e.g. dist/<deck>/all/index.html). */
export function layoutPage(
	htmlPath: string,
	distDir: string,
	fonts: FontRegistry,
	vp: Viewport,
	/** The page's HTML, when it differs from the file (e.g. diagrams pre-rendered). */
	source = readFileSync(htmlPath, "utf-8"),
): SlideLayout[] {
	const doc = parseDocument(source);
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
	return slides.map((s) =>
		withFrames(
			layoutSlide(s, [html, body], sheets, fonts, vp),
			dirname(htmlPath),
			distDir,
			fonts,
			vp,
			0,
		),
	);
}

/** Stylesheets of a document: its <link rel=stylesheet> (from `dir`, or `distDir` for /paths) and <style>. */
function documentSheets(
	doc: ReturnType<typeof parseDocument>,
	dir: string,
	distDir: string,
	vp: Viewport,
) {
	const sheets = new StyleSheets(vp);
	sheets.add(UA_CSS, 0);
	for (const el of elements(doc)) {
		if (el.name === "link" && el.attribs.rel === "stylesheet" && el.attribs.href) {
			const href = el.attribs.href.split(/[?#]/)[0] ?? "";
			if (/^[a-z]+:|^\/\//i.test(href)) continue;
			const file = href.startsWith("/") ? join(distDir, href) : join(dir, href);
			if (existsSync(file)) sheets.add(readFileSync(file, "utf-8"));
		} else if (el.name === "style") {
			sheets.add(el.children.map((c) => ("data" in c ? c.data : "")).join(""));
		}
	}
	return sheets;
}

/**
 * The document an iframe shows, when it's on this site: its `srcdoc`, or a
 * page in `distDir` (`src` relative to the embedding page's `dir`). Other
 * sites can't be laid out without a browser: null.
 */
function frameDocument(
	el: Element,
	dir: string,
	distDir: string,
): { source: string; dir: string } | null {
	if (el.attribs.srcdoc !== undefined) return { source: el.attribs.srcdoc, dir };
	const src = (el.attribs.src ?? "").split(/[?#]/)[0] ?? "";
	if (!src || /^[a-z]+:|^\/\//i.test(src)) return null;
	const base = resolve(src.startsWith("/") ? join(distDir, src) : join(dir, src));
	if (!base.startsWith(resolve(distDir))) return null;
	for (const file of [base, join(base, "index.html"), `${base}.html`]) {
		if (existsSync(file) && statSync(file).isFile())
			return { source: readFileSync(file, "utf-8"), dir: dirname(file) };
	}
	return null;
}

/**
 * Same-site iframes (srcdoc, or a page of the built site) laid out as
 * documents of their own, at the frame's size, and placed into the slide:
 * their boxes, text and tables join the slide's, clipped to the frame.
 */
function withFrames(
	layout: SlideLayout,
	dir: string,
	distDir: string,
	fonts: FontRegistry,
	vp: Viewport,
	depth: number,
): SlideLayout {
	if (depth > 2) return layout;
	for (const frame of layout.boxes.filter((b) => b.tag === "iframe")) {
		const el = layout.elements[frame.eid];
		if (!el) continue;
		const found = frameDocument(el, dir, distDir);
		if (!found) continue;
		// A fragment (srcdoc usually is) gets the <html><body> a browser would add.
		const source = /<body[\s>]/i.test(found.source)
			? found.source
			: `<html><body>${found.source}</body></html>`;
		const doc = parseDocument(source);
		const all = [...elements(doc)];
		const html = all.find((e) => e.name === "html");
		const body = all.find((e) => e.name === "body");
		if (!body) continue;
		const px = (prop: string) => Number.parseFloat(frame.style.get(prop) ?? "0") || 0;
		const x0 = frame.x + px("border-left-width") + px("padding-left");
		const y0 = frame.y + px("border-top-width") + px("padding-top");
		const w = frame.w - (x0 - frame.x) - px("border-right-width") - px("padding-right");
		const h = frame.h - (y0 - frame.y) - px("border-bottom-width") - px("padding-bottom");
		if (w <= 0 || h <= 0) continue;
		const fvp: Viewport = { width: w, height: h, media: vp.media };
		const sheets = documentSheets(doc, found.dir, distDir, fvp);
		const inner = withFrames(
			layoutSlide(body, html ? [html] : [], sheets, fonts, fvp),
			found.dir,
			distDir,
			fonts,
			fvp,
			depth + 1,
		);
		// The frame shows the document's viewport only.
		const view = frame.clip
			? intersect({ x: x0, y: y0, w, h }, frame.clip)
			: { x: x0, y: y0, w, h };
		const clipOf = (c?: Rect) => (c ? intersect({ ...c, x: c.x + x0, y: c.y + y0 }, view) : view);
		const base = layout.elements.length;
		const blockBase = Math.max(-1, ...layout.lines.map((l) => l.block?.id ?? -1)) + 1;
		const blocks = new Map<object, TextBlock>();
		const moveLine = (l: TextLine): TextLine => {
			let block = l.block;
			if (block) {
				const known = blocks.get(block) ?? { ...block, id: block.id + blockBase, x: block.x + x0 };
				blocks.set(block, known);
				block = known;
			}
			return {
				...l,
				x: l.x + x0,
				y: l.y + y0,
				lineTop: l.lineTop === undefined ? undefined : l.lineTop + y0,
				block,
				clip: clipOf(l.clip),
			};
		};
		// The document's canvas: its body's (or html's) background.
		const bodyBg = inner.style.get("background-color");
		const canvasBg =
			bodyBg && bodyBg !== "transparent"
				? bodyBg
				: html
					? sheets.declared(html).get("background-color")
					: undefined;
		const canvas: Box = {
			eid: -1,
			tag: "div",
			x: x0,
			y: y0,
			w,
			h,
			style: new Map([["background-color", canvasBg ?? "transparent"]]),
			alpha: frame.alpha,
			clip: frame.clip,
		};
		const boxes: Box[] = inner.boxes.map((b) => ({
			...b,
			eid: b.eid + base,
			x: b.x + x0,
			y: b.y + y0,
			alpha: b.alpha * frame.alpha,
			clip: clipOf(b.clip),
		}));
		layout.boxes.splice(layout.boxes.indexOf(frame) + 1, 0, canvas, ...boxes);
		layout.inlineBoxes.push(
			...inner.inlineBoxes.map((b) => ({
				...b,
				eid: b.eid + base,
				x: b.x + x0,
				y: b.y + y0,
				clip: clipOf(b.clip),
			})),
		);
		layout.lines.push(...inner.lines.map(moveLine));
		layout.markers.push(...inner.markers.map(moveLine));
		layout.tables.push(
			...inner.tables.map((t) => ({
				...t,
				eid: t.eid + base,
				x: t.x + x0,
				y: t.y + y0,
				rows: t.rows.map((r) => ({
					...r,
					eid: r.eid + base,
					y: r.y + y0,
					cells: r.cells.map((c) => ({ ...c, eid: c.eid + base, x: c.x + x0, y: c.y + y0 })),
				})),
			})),
		);
		layout.elements.push(...inner.elements);
		// Drawn: no stand-in card for it.
		el.attribs["data-astlide-framed"] = "";
	}
	return layout;
}
