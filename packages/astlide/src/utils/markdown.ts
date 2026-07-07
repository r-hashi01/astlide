/**
 * Build-time markdown → HTML rendering for short content like speaker notes.
 *
 * Notes from frontmatter are plain strings, so users naturally write **bold**,
 * lists, and links. Run them through unified/remark/rehype before the HTML
 * sanitizer so that markdown lands as actual HTML rather than rendered as
 * literal asterisks.
 */

import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const processor = unified()
	.use(remarkParse)
	.use(remarkRehype, { allowDangerousHtml: false })
	.use(rehypeStringify);

/**
 * Render a markdown string to an HTML string.
 *
 * The output is NOT sanitized — pass it through `sanitizeHTML` before injecting
 * into the page.
 */
export async function renderMarkdown(md: string): Promise<string> {
	if (!md) return "";
	const file = await processor.process(md);
	return String(file);
}
