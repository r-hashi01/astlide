/**
 * The runtime's sanitizer for speaker notes taken from the page, with the
 * rules of the build-time `sanitizeHTML()` (`utils/sanitize-policy`), on the
 * DOM instead of a parsed tree.
 *
 * @module
 */

import {
	ALLOWED_TAGS,
	attributeAllowed,
	STRIP_WITH_CONTENT,
	safeUrl,
	TARGET_REL,
} from "../utils/sanitize-policy";

/** `NodeFilter.SHOW_COMMENT` (a constant, so this also runs where `NodeFilter` isn't global). */
const SHOW_COMMENT = 0x80;

/**
 * Notes HTML safe to inject:
 *   1. Remove comments, and dangerous tags with their content.
 *   2. Unwrap tags not in the allowlist (deepest first, keeping children).
 *   3. Keep allowlisted attributes and safe URLs in `href` / `src`; a kept
 *      `target` gets `rel="noopener noreferrer"`.
 */
export function sanitizeNotesHtml(html: string, parser: DOMParser = new DOMParser()): string {
	const doc = parser.parseFromString(html, "text/html");
	const comments = doc.createTreeWalker(doc.body, SHOW_COMMENT);
	const drop: Node[] = [];
	while (comments.nextNode()) drop.push(comments.currentNode);
	for (const node of drop) node.parentNode?.removeChild(node);
	for (const tag of STRIP_WITH_CONTENT) {
		for (const el of doc.body.querySelectorAll(tag)) el.remove();
	}
	for (const el of Array.from(doc.body.querySelectorAll("*")).reverse()) {
		if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) el.replaceWith(...Array.from(el.childNodes));
	}
	for (const el of doc.body.querySelectorAll("*")) {
		const tag = el.tagName.toLowerCase();
		for (const attr of Array.from(el.attributes)) {
			const name = attr.name.toLowerCase();
			const keep =
				attributeAllowed(tag, name) && ((name !== "href" && name !== "src") || safeUrl(attr.value));
			if (!keep) el.removeAttribute(attr.name);
		}
		if (el.hasAttribute("target")) el.setAttribute("rel", TARGET_REL);
	}
	return doc.body.innerHTML;
}
