/**
 * Speaker notes as the slide page shows them: Markdown rendered and
 * sanitized (frontmatter `notes` and comment notes are Markdown).
 *
 * @module
 */

import { renderMarkdown } from "../utils/markdown";
import { sanitizeHTML } from "../utils/sanitize";

/** Notes (Markdown) as sanitized HTML, ready for the presenter panel and the notes overlay. */
export async function renderNotesHtml(notes: string): Promise<string> {
	return sanitizeHTML(await renderMarkdown(notes));
}
