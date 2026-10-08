/**
 * Derive a human-readable title for a slide, used by the go-to-slide dialog.
 *
 * Order of precedence:
 * 1. frontmatter `title`
 * 2. the first Markdown heading (`# …` – `###### …`) outside code fences
 * 3. the first HTML heading (`<h1>` – `<h6>`), for `.html` slides and inline HTML
 *
 * @module
 */

/** The subset of a content collection entry this helper reads. */
export interface SlideTitleSource {
	data: { title?: string };
	body?: string;
}

/**
 * @param entry - A deck slide entry (`.mdx`, `.md` or `.html`).
 * @returns The slide title, or `undefined` when none can be found.
 *
 * @example
 * slideTitle({ data: {}, body: "# Welcome\n\nHello" }); // → "Welcome"
 */
export function slideTitle(entry: SlideTitleSource): string | undefined {
	const fromFrontmatter = entry.data.title?.trim();
	if (fromFrontmatter) return fromFrontmatter;
	if (!entry.body) return undefined;

	// Ignore headings inside fenced code blocks (e.g. a `# comment` in bash).
	const body = entry.body.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");

	const markdown = /^#{1,6}[ \t]+(.+?)[ \t#]*$/m.exec(body);
	const html = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/i.exec(body);
	// Whichever heading appears first in the slide wins.
	const match =
		markdown && (!html || markdown.index <= html.index)
			? cleanMarkdown(markdown[1])
			: html
				? cleanHtml(html[2])
				: undefined;
	return match || undefined;
}

/** Strip inline Markdown markup: emphasis, code spans, links. */
function cleanMarkdown(text: string): string {
	return text
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/(\*\*|__|\*|_|`)(.+?)\1/g, "$2")
		.trim();
}

/** Strip tags and decode the handful of entities headings commonly contain. */
function cleanHtml(text: string): string {
	return text
		.replace(/<[^>]*>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}
