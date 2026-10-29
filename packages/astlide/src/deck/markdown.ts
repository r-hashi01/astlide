/**
 * Markdown slides to HTML without Astro, with the pipeline Astro uses for
 * them in an Astlide site: Astro's own Markdown processor (GFM, smart
 * punctuation, heading ids, Shiki) and Astlide's Shiki transformers (`{2|3-5}`
 * line steps, ```mermaid fences).
 *
 * @module
 */

import { createSatteriMarkdownProcessor } from "@astrojs/markdown-satteri";

type ShikiConfig = NonNullable<
	NonNullable<Parameters<typeof createSatteriMarkdownProcessor>[0]>["shikiConfig"]
>;

import { astlideCodeHighlight } from "../utils/code-highlight";
import { astlideMermaid } from "../utils/mermaid";

export interface SlideMarkdownOptions {
	/** Shiki theme for code blocks (the integration's `shikiTheme`). Default `github-dark`. */
	shikiTheme?: string;
	/** Extra Shiki languages and themes (what plugins add). */
	shikiLangs?: unknown[];
	shikiThemes?: Record<string, unknown>;
}

/** Renders a Markdown slide body (without frontmatter) to HTML. */
export type SlideMarkdownRenderer = (markdown: string) => Promise<string>;

/** A renderer; create it once and reuse it (it loads Shiki). */
export async function createSlideMarkdownRenderer(
	options: SlideMarkdownOptions = {},
): Promise<SlideMarkdownRenderer> {
	// Astlide's transformers and plugin languages are typed loosely (Shiki's own
	// types load lazily); the integration hands Astro the same object.
	const shikiConfig = {
		theme: options.shikiTheme ?? "github-dark",
		wrap: true,
		transformers: [astlideCodeHighlight(), astlideMermaid()],
		langs: options.shikiLangs ?? [],
		themes: options.shikiThemes ?? {},
	} as unknown as ShikiConfig;
	const processor = await createSatteriMarkdownProcessor({ shikiConfig });
	return async (markdown) => (await processor.render(markdown, { frontmatter: {} })).code;
}
