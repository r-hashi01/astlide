import render from "dom-serializer";
import { type ChildNode, isTag } from "domhandler";
import { decodeHTML } from "entities";
import { parseDocument } from "htmlparser2";

/**
 * Lightweight HTML sanitizer for build-time use.
 *
 * Strips dangerous tags (script, iframe, etc.), event-handler attributes,
 * and dangerous URL protocols while preserving safe formatting tags.
 */

/** Tags whose opening and closing (plus inner content) are removed entirely. */
const STRIP_WITH_CONTENT = new Set([
	"script",
	"style",
	"iframe",
	"object",
	"embed",
	"form",
	"input",
	"textarea",
	"select",
	"button",
	"link",
	"meta",
	"base",
	"applet",
	"frame",
	"frameset",
	"layer",
	"ilayer",
	"bgsound",
]);

/** Tags allowed to remain in sanitized output. */
const ALLOWED_TAGS = new Set([
	"b",
	"i",
	"em",
	"strong",
	"code",
	"pre",
	"a",
	"ul",
	"ol",
	"li",
	"p",
	"br",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"blockquote",
	"span",
	"div",
	"hr",
	"table",
	"thead",
	"tbody",
	"tr",
	"th",
	"td",
	"dl",
	"dt",
	"dd",
	"sup",
	"sub",
	"mark",
	"del",
	"ins",
	"kbd",
	"abbr",
	"small",
	"details",
	"summary",
]);

/** Attributes allowed on any element. */
const ALLOWED_ATTRS = new Set([
	"class",
	"id",
	"title",
	"lang",
	"dir",
	"role",
	"aria-label",
	"aria-hidden",
	"aria-describedby",
	"data-fragment",
	"data-fragment-index",
	"data-fragment-effect",
]);

/** Per-tag attribute allowlists (in addition to global ALLOWED_ATTRS). */
const TAG_ATTRS: Record<string, Set<string>> = {
	a: new Set(["href", "target", "rel"]),
	img: new Set(["src", "alt", "width", "height"]),
	td: new Set(["colspan", "rowspan"]),
	th: new Set(["colspan", "rowspan", "scope"]),
	ol: new Set(["start", "type"]),
	abbr: new Set(["title"]),
};

/** URL protocols considered safe for href/src. */
const SAFE_PROTOCOLS = /^(?:https?:|mailto:|#|\/)/i;

/** Matches on* event-handler attributes like onclick, onerror. */
const EVENT_HANDLER_RE = /^on\w+$/i;

/**
 * Sanitize an HTML string by removing dangerous elements and attributes.
 *
 * Works on a parsed tree (htmlparser2), not on regexes, so odd spellings and
 * unterminated tags can't slip through. Tags in the allowlist are kept with
 * their allowed attributes; `script`, `iframe`, form controls and similar are
 * removed with their content; any other tag is dropped and its content kept.
 * `href` / `src` must be `http(s):`, `mailto:`, `#…` or a `/…` path. Text is
 * written back escaped, so the output is always well-formed.
 *
 * Designed for build-time use (Node.js). Does NOT rely on DOM APIs.
 */
export function sanitizeHTML(html: string): string {
	if (!html) return "";
	const doc = parseDocument(html, { decodeEntities: true, lowerCaseTags: true });
	const clean = (nodes: ChildNode[]) => {
		for (const node of [...nodes]) {
			if (node.type === "comment" || node.type === "directive" || node.type === "cdata") {
				removeElement(node);
				continue;
			}
			if (!isTag(node)) continue;
			const tag = node.name.toLowerCase();
			if (STRIP_WITH_CONTENT.has(tag)) {
				removeElement(node);
				continue;
			}
			clean(node.children);
			if (!ALLOWED_TAGS.has(tag)) {
				unwrap(node);
				continue;
			}
			node.attribs = sanitizeAttributes(tag, node.attribs);
		}
	};
	clean(doc.children);
	return render(doc, { encodeEntities: "utf8", decodeEntities: true });
}

/** The attributes of a `tag` that may stay: allowlisted, no event handlers, safe URLs. */
function sanitizeAttributes(tag: string, attribs: Record<string, string>): Record<string, string> {
	const tagAllowed = TAG_ATTRS[tag];
	const out: Record<string, string> = {};
	for (const [rawName, value] of Object.entries(attribs)) {
		const name = rawName.toLowerCase();
		if (EVENT_HANDLER_RE.test(name)) continue;
		if (!ALLOWED_ATTRS.has(name) && !tagAllowed?.has(name)) continue;
		if (
			(name === "href" || name === "src") &&
			// biome-ignore lint/suspicious/noControlCharactersInRegex: browsers ignore these in a URL scheme, so must we
			!SAFE_PROTOCOLS.test(value.replace(/[\u0000-\u0020]+/g, ""))
		)
			continue;
		out[name] = value;
	}
	return out;
}

/** Replace an element by its children. */
function unwrap(node: ChildNode): void {
	const parent = node.parent;
	if (!parent || !isTag(node)) {
		removeElement(node);
		return;
	}
	const i = parent.children.indexOf(node);
	const kids = node.children;
	for (const kid of kids) kid.parent = parent;
	parent.children.splice(i, 1, ...kids);
	// Re-link siblings around the inserted children.
	for (let k = Math.max(0, i - 1); k < Math.min(parent.children.length, i + kids.length + 1); k++) {
		const n = parent.children[k] as ChildNode;
		n.prev = (parent.children[k - 1] as ChildNode | undefined) ?? null;
		n.next = (parent.children[k + 1] as ChildNode | undefined) ?? null;
	}
	node.parent = node.prev = node.next = null;
	node.children = [];
}

/**
 * Sanitize KaTeX-generated HTML output.
 *
 * Lighter than sanitizeHTML — preserves SVG elements and inline styles
 * required for correct math rendering while removing the three injection vectors:
 *   1. <script> elements (KaTeX never generates these, but belt-and-suspenders)
 *   2. on* event-handler attributes
 *   3. javascript:/vbscript: URLs in href/src/xlink:href/action/formaction
 *
 * Works on a parsed tree, not regexes, so odd spellings (`</script >`,
 * `<ScRiPt>`, entities in URLs) can't slip through. Entities and markup are
 * otherwise written back as they were.
 */
export function sanitizeKaTeXOutput(html: string): string {
	if (!html) return "";
	const doc = parseDocument(html, { decodeEntities: false, recognizeSelfClosing: true });
	const clean = (nodes: ChildNode[]) => {
		for (const node of [...nodes]) {
			if (node.type === "script" || (isTag(node) && node.name.toLowerCase() === "script")) {
				removeElement(node);
				continue;
			}
			if (!isTag(node)) continue;
			for (const name of Object.keys(node.attribs)) {
				const key = name.toLowerCase();
				if (key.startsWith("on")) delete node.attribs[name];
				else if (
					URL_ATTRIBUTES.has(key) &&
					SCRIPT_URL.test(decodeForCheck(node.attribs[name] ?? ""))
				)
					delete node.attribs[name];
			}
			clean(node.children);
		}
	};
	clean(doc.children);
	return render(doc, { decodeEntities: false, encodeEntities: false, selfClosingTags: true });
}

const URL_ATTRIBUTES = new Set(["href", "src", "xlink:href", "action", "formaction"]);
const SCRIPT_URL = /^(?:javascript|vbscript):/;

/** An attribute value as a browser would read its scheme: entities decoded, controls / spaces dropped, lower case. */
function decodeForCheck(value: string): string {
	return (
		decodeHTML(value)
			// biome-ignore lint/suspicious/noControlCharactersInRegex: browsers ignore these in a URL scheme, so must we
			.replace(/[\u0000-\u0020]+/g, "")
			.toLowerCase()
	);
}

/** Remove an element from its parent (domhandler keeps sibling links). */
function removeElement(node: ChildNode): void {
	const parent = node.parent;
	if (!parent) return;
	const i = parent.children.indexOf(node);
	if (i >= 0) parent.children.splice(i, 1);
	if (node.prev) node.prev.next = node.next;
	if (node.next) node.next.prev = node.prev;
	node.parent = node.prev = node.next = null;
}

/**
 * Validate a CSS background value.
 * Blocks CSS injection attempts (expressions, url(javascript:), etc.).
 *
 * Returns the original value if safe, or an empty string if dangerous.
 */
export function sanitizeBackground(value: string): string {
	if (!value) return "";

	const lower = value.toLowerCase().replace(/\s+/g, " ").trim();

	// Block dangerous CSS patterns
	const dangerous =
		/expression\s*\(|url\s*\(\s*["']?\s*javascript:|url\s*\(\s*["']?\s*vbscript:|url\s*\(\s*["']?\s*data:\s*(?:text\/html|image\/svg)|@import|behavior\s*:/i;
	if (dangerous.test(lower)) return "";

	// Block attempts to break out of the style attribute context
	if (lower.includes("}") || lower.includes("{")) return "";

	return value;
}
