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
 * MDX doesn't allow HTML comments, so {@link astlideCommentNotesPlugin} removes
 * the trailing one from `.mdx` sources before they are compiled.
 *
 * @module
 */

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
