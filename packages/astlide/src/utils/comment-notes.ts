/**
 * Speaker notes written as an HTML comment at the end of a slide, as in Slidev
 * and Marp:
 *
 * ```md
 * # My slide
 *
 * Content…
 *
 * <!--
 * Mention the **demo** here.
 * -->
 * ```
 *
 * Only a comment that *ends* the slide counts (nothing but whitespace after
 * it), so comments elsewhere stay comments. Works in `.md`, `.mdx` and `.html`
 * slides. Priority: `<SpeakerNotes>` > frontmatter `notes` > trailing comment.
 *
 * The comment is always taken out of what the slide renders — the notes are
 * read from the raw body and only reach pages when notes are included (see
 * `utils/notes`): {@link astlideCommentNotesPlugin} removes it from `.mdx`
 * sources (MDX doesn't allow HTML comments anyway), and the deck loader from
 * rendered `.md` and `.html` slides ({@link withoutNotesComment}) — wherever
 * the comment ends up in the rendered HTML (before footnotes, in a list).
 *
 * @module
 */

import { type DefaultTreeAdapterMap, parseFragment } from "parse5";
import type { Plugin } from "vite";

/** The last `<!-- … -->` in the text, followed only by whitespace. */
const TRAILING_COMMENT = /<!--((?:(?!<!--)[\s\S])*?)-->\s*$/;

/** Remove the indentation shared by every non-blank line. */
function dedent(text: string): string {
	const lines = text.split("\n");
	const indents = lines
		.filter((line) => line.trim() !== "")
		.map((line) => /^[ \t]*/.exec(line)?.[0].length ?? 0);
	const shared = indents.length > 0 ? Math.min(...indents) : 0;
	return lines.map((line) => line.slice(shared)).join("\n");
}

/**
 * The speaker notes in a slide's trailing HTML comment, or `undefined` when the
 * slide doesn't end with one (or it is empty).
 *
 * @param body - The slide's raw source after the frontmatter.
 * @returns The comment's text, dedented and trimmed (Markdown is rendered later).
 *
 * @example
 * extractCommentNotes("# Hi\n\n<!-- Say hello -->\n"); // → "Say hello"
 * extractCommentNotes("<!-- draft -->\n# Hi");         // → undefined
 */
export function extractCommentNotes(body: string): string | undefined {
	const match = TRAILING_COMMENT.exec(body);
	const text = match ? dedent(match[1] ?? "").trim() : "";
	return text || undefined;
}

/**
 * Remove a slide's trailing HTML comment, keeping its line breaks so line
 * numbers in error messages stay right. Returns `null` when there is none.
 */
export function stripTrailingComment(source: string): string | null {
	const match = TRAILING_COMMENT.exec(source);
	if (!match) return null;
	return source.slice(0, match.index) + match[0].replace(/[^\n]/g, "");
}

type Node = DefaultTreeAdapterMap["childNode"];
type ParentNode = DefaultTreeAdapterMap["parentNode"];

/**
 * `html` without the comment(s) holding `notes` — the comment nodes a
 * browser would see whose text is the notes — or `null` when there is none.
 * Everything else is kept byte for byte.
 */
export function withoutNotesComment(html: string, notes: string): string | null {
	const ranges: [number, number][] = [];
	const walk = (parent: ParentNode) => {
		for (const node of parent.childNodes as Node[]) {
			if (node.nodeName === "#comment") {
				const data = (node as DefaultTreeAdapterMap["commentNode"]).data;
				const at = node.sourceCodeLocation;
				if (at && dedent(data).trim() === notes) ranges.push([at.startOffset, at.endOffset]);
			} else if ("childNodes" in node) {
				walk(node as ParentNode);
				if ("content" in node) walk((node as DefaultTreeAdapterMap["template"]).content);
			}
		}
	};
	walk(parseFragment(html, { sourceCodeLocationInfo: true, scriptingEnabled: true }));
	if (!ranges.length) return null;
	let out = "";
	let at = 0;
	for (const [start, end] of ranges.sort((a, b) => a[0] - b[0])) {
		out += html.slice(at, start);
		at = end;
	}
	return out + html.slice(at);
}

/**
 * Vite plugin: drop the trailing HTML comment (speaker notes) from `.mdx`
 * sources before `@astrojs/mdx` compiles them — MDX would reject it. The notes
 * themselves are read from the entry's raw body by the slide page.
 */
export function astlideCommentNotesPlugin(): Plugin {
	return {
		name: "astlide:comment-notes",
		enforce: "pre",
		transform(code, id) {
			if (!/\.mdx(?:$|\?)/.test(id)) return null;
			const stripped = stripTrailingComment(code);
			return stripped === null ? null : { code: stripped, map: null };
		},
	};
}
