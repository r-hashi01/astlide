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
 * Designed for build-time use (Node.js). Does NOT rely on DOM APIs.
 */
export function sanitizeHTML(html: string): string {
	if (!html) return "";

	let result = html;

	// 1. Remove tags that should be stripped with their content.
	for (const tag of STRIP_WITH_CONTENT) {
		const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
		result = result.replace(re, "");
		// Also remove self-closing variants
		const selfClose = new RegExp(`<${tag}\\b[^>]*/?>`, "gi");
		result = result.replace(selfClose, "");
	}

	// 2. Process remaining HTML tags — keep allowed, strip others.
	result = result.replace(
		/<\/?([a-z][a-z0-9]*)\b([^>]*)?\/?>/gi,
		(match, tagName: string, attrsStr: string) => {
			const tag = tagName.toLowerCase();
			const isClosing = match.startsWith("</");

			if (!ALLOWED_TAGS.has(tag)) {
				return "";
			}

			if (isClosing) {
				return `</${tag}>`;
			}

			const safeAttrs = sanitizeAttributes(tag, attrsStr || "");
			const selfClosing = match.trimEnd().endsWith("/>") ? " /" : "";
			return `<${tag}${safeAttrs}${selfClosing}>`;
		},
	);

	return result;
}

/**
 * Parse and sanitize attributes for a given tag.
 * Removes event handlers, disallowed attributes, and dangerous URLs.
 */
function sanitizeAttributes(tag: string, attrsStr: string): string {
	if (!attrsStr.trim()) return "";

	const tagAllowed = TAG_ATTRS[tag];
	const attrs: string[] = [];

	// Match attribute patterns: name="value", name='value', name=value, name
	const attrRe = /([a-z][a-z0-9_-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi;
	let attrMatch = attrRe.exec(attrsStr);
	while (attrMatch !== null) {
		const name = attrMatch[1].toLowerCase();
		const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

		// Block event handlers
		if (EVENT_HANDLER_RE.test(name)) {
			attrMatch = attrRe.exec(attrsStr);
			continue;
		}

		// Check allowlists
		const isAllowed = ALLOWED_ATTRS.has(name) || tagAllowed?.has(name);
		if (!isAllowed) {
			attrMatch = attrRe.exec(attrsStr);
			continue;
		}

		// Validate URL attributes — strip control characters before protocol check
		if (name === "href" || name === "src") {
			// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char strip
			const trimmed = value.trim().replace(/[\x00-\x1f]/g, "");
			if (!SAFE_PROTOCOLS.test(trimmed)) {
				attrMatch = attrRe.exec(attrsStr);
				continue;
			}
		}

		attrs.push(` ${name}="${escapeAttrValue(value)}"`);
		attrMatch = attrRe.exec(attrsStr);
	}

	return attrs.join("");
}

/** Escape special characters in an attribute value. */
function escapeAttrValue(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/**
 * Sanitize KaTeX-generated HTML output.
 *
 * Lighter than sanitizeHTML — preserves SVG elements and inline styles
 * required for correct math rendering while removing the three injection vectors:
 *   1. <script> tags (KaTeX never generates these, but belt-and-suspenders)
 *   2. on* event-handler attributes
 *   3. javascript:/vbscript: URLs in href/src/xlink:href
 */
export function sanitizeKaTeXOutput(html: string): string {
	if (!html) return "";
	let result = html;
	// 1. Strip <script>...</script>
	result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
	// 2. Remove on* event-handler attributes
	result = result.replace(/\s+on[a-z]\w*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
	// 3. Strip javascript:/vbscript: from href/src/xlink:href
	result = result.replace(
		/(?:href|src|xlink:href)\s*=\s*["']?\s*(?:javascript:|vbscript:)[^"'\s>]*/gi,
		"",
	);
	return result;
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
