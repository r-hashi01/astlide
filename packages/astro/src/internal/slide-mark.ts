/**
 * The comments that mark where a slide's content starts and ends in a page,
 * so the CSP pass after a build can tell the slides' own inline scripts from
 * Astlide's (see `utils/csp-hashes`). They carry a random value made for each
 * build, so content written before the build can't fake the end of a slide.
 *
 * Only content slides are marked: Markdown, HTML and PowerPoint, which can
 * come from others. MDX slides are code — they run JavaScript at build time,
 * so their scripts (and their components') are as trusted as the project.
 *
 * @module
 */

declare const __ASTLIDE_SLIDE_MARK__: string;

/** The comments around a slide's content, for a build's `mark`. */
export function slideContentMarks(mark: string): { start: string; end: string } {
	return { start: `astlide-slide:${mark}`, end: `/astlide-slide:${mark}` };
}

/** This build's marks. */
export const slideMarks = slideContentMarks(
	typeof __ASTLIDE_SLIDE_MARK__ !== "undefined" ? __ASTLIDE_SLIDE_MARK__ : "",
);

/**
 * The comments to put around a slide's content: the marks for content slides
 * (Markdown, HTML, PowerPoint), none for MDX (see the module notes).
 */
export function slideContentComments(filePath: string | undefined): { start: string; end: string } {
	if (filePath?.toLowerCase().endsWith(".mdx")) return { start: "", end: "" };
	return { start: `<!--${slideMarks.start}-->`, end: `<!--${slideMarks.end}-->` };
}
