/**
 * Speaker notes from the print view, as plain text.
 *
 * @module
 */

import type { ChildNode, Element } from "domhandler";
import { parseDocument } from "htmlparser2";
/**
 * Speaker notes of each slide in the print view (`body > .slide`, as laid
 * out): `<SpeakerNotes>` content, else the frontmatter / comment notes the
 * page carries as `[data-slide-notes="meta"]`. Plain text, a line per paragraph.
 */
export function speakerNotes(html: string): string[] {
	const doc = parseDocument(html);
	const body = findAll((e) => e.name === "body", doc.children)[0];
	const slides = (body?.children ?? []).filter(
		(c): c is Element => isTag(c) && /(^|\s)slide(\s|$)/.test(c.attribs.class ?? ""),
	);
	return slides.map((slide) => {
		const all = findAll((e) => e.attribs["data-slide-notes"] !== undefined, slide.children);
		const own = all.find((e) => e.attribs["data-slide-notes"] !== "meta");
		const el = own ?? all[0];
		return el ? plainText(el).trim() : "";
	});
}

const isTag = (n: ChildNode): n is Element => n.type === "tag";

/** Elements matching `test` below `nodes`, in document order. */
function findAll(test: (e: Element) => boolean, nodes: ChildNode[]): Element[] {
	const out: Element[] = [];
	for (const n of nodes) {
		if (!isTag(n)) continue;
		if (test(n)) out.push(n);
		out.push(...findAll(test, n.children));
	}
	return out;
}

const BLOCK = /^(p|div|li|ul|ol|h[1-6]|pre|blockquote|tr|table|section)$/;

/** Text of an element, with blocks and `<br>` as line breaks and list items bulleted. */
function plainText(el: Element): string {
	let out = "";
	for (const c of el.children) {
		// Line breaks in text are kept (frontmatter notes); other runs of white space collapse.
		if (c.type === "text")
			out += (c as unknown as { data: string }).data.replace(/[ \t\f\r]+/g, " ");
		else if (isTag(c)) {
			if (c.name === "br") out += "\n";
			else if (BLOCK.test(c.name)) {
				const inner = plainText(c).trim();
				if (inner) out += `\n${c.name === "li" ? "• " : ""}${inner}\n`;
			} else out += plainText(c);
		}
	}
	return out
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.join("\n");
}
