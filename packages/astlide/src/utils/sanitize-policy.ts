/**
 * What the HTML sanitizers keep: one policy for the build-time sanitizer
 * (`utils/sanitize.ts`, on a parsed tree) and the browser runtime's notes
 * sanitizer (on the DOM). No dependencies, so the runtime can import it.
 *
 * @module
 */

/** Tags whose opening and closing (plus inner content) are removed entirely. */
export const STRIP_WITH_CONTENT = new Set([
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
export const ALLOWED_TAGS = new Set([
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
export const ALLOWED_ATTRS = new Set([
	"class",
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
export const TAG_ATTRS: Record<string, Set<string>> = {
	a: new Set(["href", "target", "rel"]),
	img: new Set(["src", "alt", "width", "height"]),
	td: new Set(["colspan", "rowspan"]),
	th: new Set(["colspan", "rowspan", "scope"]),
	ol: new Set(["start", "type"]),
	abbr: new Set(["title"]),
};

/** URL protocols considered safe for href/src (a `/` path, but not protocol-relative `//` or `/\`). */
export const SAFE_PROTOCOLS = /^(?:https?:|mailto:|#|\/(?![/\\]))/i;

/** Matches on* event-handler attributes like onclick, onerror. */
export const EVENT_HANDLER_RE = /^on\w+$/i;

/** Whether `tag` may keep an attribute called `name` (lowercase). */
export function attributeAllowed(tag: string, name: string): boolean {
	if (EVENT_HANDLER_RE.test(name)) return false;
	return ALLOWED_ATTRS.has(name) || TAG_ATTRS[tag]?.has(name) === true;
}

/**
 * Whether an `href` / `src` value is safe: `http(s):`, `mailto:`, `#…` or a
 * `/…` path, not protocol-relative (`//…`, `/\…`). Control characters and
 * spaces, which browsers ignore in a scheme, are ignored here too.
 */
export function safeUrl(value: string): boolean {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: browsers ignore these in a URL scheme, so must we
	return SAFE_PROTOCOLS.test(value.replace(/[\u0000-\u0020]+/g, ""));
}

/** What a kept `target` comes with, so the opened page can't reach this one. */
export const TARGET_REL = "noopener noreferrer";
