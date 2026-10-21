/**
 * Scripts in Markdown, HTML and PowerPoint slides — content that may come
 * from someone else (an imported `.pptx`, an HTML slide someone sent) — are
 * removed when the slide is rendered, in `astro dev` and in builds alike:
 * `<script>` elements, inline event handlers (`onclick` …), `javascript:`
 * URLs, `srcdoc` documents and the like. A script in a slide would otherwise
 * run with the site's origin — in `astro dev`, next to the slide editor.
 * MDX slides are code (they run at build time anyway) and keep theirs.
 * `slideScripts: true` (integration option) keeps them everywhere. The deck
 * loader applies it (see `loader.ts`).
 *
 * @module
 */

import { render } from "dom-serializer";
import type { ChildNode, Element } from "domhandler";
import { parseDocument } from "htmlparser2";

/** Set by the integration from its `slideScripts` option; read by the deck loader. */
const FLAG = Symbol.for("astlide:slideScripts");

/** Record whether slide scripts are kept (the integration calls this). */
export function setSlideScripts(keep: boolean): void {
	(globalThis as Record<symbol, unknown>)[FLAG] = keep;
}

/** Whether slide scripts are kept (`slideScripts: true`). */
export function slideScriptsKept(): boolean {
	return (globalThis as Record<symbol, unknown>)[FLAG] === true;
}

/** Elements dropped with their content. */
const DROPPED = new Set([
	"script",
	"object",
	"embed",
	"applet",
	"base",
	"frame",
	"frameset",
	"portal",
]);
/** SVG animation elements, dropped when they animate a link or a handler. */
const ANIMATION = new Set(["animate", "set", "animatemotion", "animatetransform"]);
/** Attributes whose value is a URL (or, for animations, may become one). */
const URL_ATTRIBUTES = new Set([
	"href",
	"xlink:href",
	"src",
	"action",
	"formaction",
	"data",
	"poster",
	"background",
	"values",
	"to",
	"from",
	"by",
]);

/** Whether a URL attribute's value runs script (`javascript:` / `vbscript:`, however spelled). */
function scriptUrl(value: string): boolean {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: browsers ignore these in a scheme
	const compact = value.replace(/[\u0000- ]/g, "").toLowerCase();
	return compact.startsWith("javascript:") || compact.startsWith("vbscript:");
}

/** Whether an attribute (name lower-cased) is one this module removes. */
function unsafeAttribute(name: string, value: string): boolean {
	return (
		name.startsWith("on") || name === "srcdoc" || (URL_ATTRIBUTES.has(name) && scriptUrl(value))
	);
}

/** Whether an element (name lower-cased) is dropped with its content. */
function unsafeElement(name: string, attributes: Record<string, unknown>): boolean {
	if (DROPPED.has(name)) return true;
	if (name === "meta" && "http-equiv" in attributes) return true;
	if (ANIMATION.has(name)) {
		const target = String(attributes.attributeName ?? attributes.attributename ?? "").toLowerCase();
		return target.startsWith("on") || target.endsWith("href");
	}
	return false;
}

/** Remove scripts from an element tree; whether anything was removed. */
function clean(nodes: ChildNode[]): boolean {
	let changed = false;
	for (let i = nodes.length - 1; i >= 0; i--) {
		const node = nodes[i];
		if (!node || (node.type !== "tag" && node.type !== "script" && node.type !== "style")) continue;
		const el = node as Element;
		if (unsafeElement(el.name.toLowerCase(), el.attribs)) {
			nodes.splice(i, 1);
			changed = true;
			continue;
		}
		for (const [name, value] of Object.entries(el.attribs)) {
			if (unsafeAttribute(name.toLowerCase(), value)) {
				delete el.attribs[name];
				changed = true;
			}
		}
		if (clean(el.children)) changed = true;
	}
	return changed;
}

/**
 * `html` without scripts (see the module). Returned unchanged — byte for
 * byte — when there is nothing to remove.
 */
export function stripSlideScripts(html: string): string {
	// Names keep their case: Astro's image markers (`__ASTRO_IMAGE_`) must survive.
	const doc = parseDocument(html, {
		decodeEntities: true,
		lowerCaseTags: false,
		lowerCaseAttributeNames: false,
	});
	return clean(doc.children) ? render(doc, { encodeEntities: "utf8" }) : html;
}
