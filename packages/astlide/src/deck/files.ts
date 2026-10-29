/**
 * Slide files on disk, shared by the Astro loader and the framework-agnostic
 * deck reader: which files are slides, their ids, frontmatter and notes.
 *
 * @module
 */

import { load as parseYaml } from "js-yaml";
import { extractCommentNotes, withoutNotesComment } from "../utils/comment-notes";

/** Extensions this loader treats as slides. */
export const SLIDE_EXTENSION = /\.(?:mdx|md|html?)$/i;
export const HTML_EXTENSION = /\.html?$/i;
export const PPTX_EXTENSION = /\.pptx$/i;

/**
 * Derive a stable, extension-less entry ID from a path relative to the deck base.
 * Shared by the MDX/Markdown glob delegate and the HTML ingester so that, e.g.,
 * `example-deck/03-slide.html` and `example-deck/04-slide.mdx` sort together.
 */
export function toEntryId(relPath: string): string {
	return relPath.replace(/\\/g, "/").replace(SLIDE_EXTENSION, "");
}

/** Split a leading `---\nYAML\n---` frontmatter block from an HTML slide body. */
export function splitFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
	if (!match) return { data: {}, body: raw };
	const parsed = parseYaml(match[1]);
	const data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
	return { data, body: raw.slice(match[0].length) };
}

/** An HTML slide's body without its trailing notes comment. */
export function htmlWithoutNotes(body: string): string {
	const notes = extractCommentNotes(body);
	return (notes === undefined ? null : withoutNotesComment(body, notes)) ?? body;
}
