/**
 * Read Astlide decks from disk without Astro: a deck folder (`_config.json`
 * and numbered `.md` / `.mdx` / `.html` / `.pptx` files) becomes its config
 * and slides, in order, with validated frontmatter, title, speaker notes and
 * — for Markdown, HTML and PowerPoint slides — the slide's HTML, rendered as
 * an Astlide site renders it. React, Next.js and Vue hosts build their pages
 * from this.
 *
 * ```ts
 * import { readDeck } from "@astlide/core/deck";
 *
 * const deck = await readDeck("src/content/decks/q3-review");
 * deck.config.title;           // from _config.json
 * deck.slides[0].html;         // the first slide's HTML
 * ```
 *
 * `.mdx` slides come back with their source (`body`) and no `html`: MDX is
 * code, compiled by the host's MDX setup.
 *
 * Experimental: part of the work towards React / Next / Vue support.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { type DeckConfig, deprecatedClassWarning, type SlideData, slideSchema } from "../schema";
import { extractCommentNotes, withoutNotesComment } from "../utils/comment-notes";
import { consoleReporter, type Reporter } from "../utils/reporter";
import { stripSlideScripts } from "../utils/slide-scripts";
import { slideTitle } from "../utils/slide-title";
import {
	filesIn,
	HTML_EXTENSION,
	htmlWithoutNotes,
	PPTX_EXTENSION,
	pptxSlideId,
	readDeckConfig,
	SLIDE_EXTENSION,
	splitFrontmatter,
	toEntryId,
} from "./files";
import {
	createSlideMarkdownRenderer,
	type SlideMarkdownOptions,
	type SlideMarkdownRenderer,
} from "./markdown";

export {
	compileSlideMdx,
	evaluateSlideMdx,
	type SlideMdxOptions,
	type SlideMdxRuntime,
} from "./mdx";
export { renderNotesHtml } from "./notes";
export { createSlideMarkdownRenderer, type SlideMarkdownOptions, type SlideMarkdownRenderer };

export type SlideFormat = "md" | "mdx" | "html" | "pptx";

/** One slide of a deck. */
export interface DeckSlide {
	/** `<file without extension>`, or `<file>--<page>` for a PowerPoint page (`03-talk--002`). */
	id: string;
	/** 1-based position in the deck (hidden slides count). */
	number: number;
	/** The source file, relative to the deck folder. */
	file: string;
	format: SlideFormat;
	/** Frontmatter, validated and with defaults (`slideSchema`). */
	data: SlideData;
	/** The source without frontmatter (`.md` / `.mdx` / `.html`), or the page's HTML (`.pptx`). */
	body: string;
	/** The slide as HTML; undefined for `.mdx`. */
	html?: string;
	/** Frontmatter `title`, else the first heading. */
	title?: string;
	/** Frontmatter `notes`, else an HTML comment ending the slide (Markdown). */
	notes?: string;
}

export interface Deck {
	/** The folder's name: the deck's URL segment. */
	name: string;
	/** `_config.json`, validated and with defaults. */
	config: DeckConfig;
	/** Why `_config.json` couldn't be used (the defaults are used instead). */
	configIssue?: string;
	slides: DeckSlide[];
}

export interface ReadDeckOptions {
	/** How Markdown slides are rendered (Shiki theme …), or a renderer to share between decks. */
	markdown?: SlideMarkdownOptions | SlideMarkdownRenderer;
	/**
	 * Where the pictures and fonts of PowerPoint pages go: return the URL to
	 * use for each file. Default: inlined as `data:` URLs.
	 */
	pptxMedia?: (file: { name: string; data: Buffer; type: string }) => string | null;
	/** Keep `<script>` in Markdown, HTML and PowerPoint slides (the `slideScripts` option). Default: removed. */
	slideScripts?: boolean;
	/** Where warnings go (deprecated slide classes). Default: the console. */
	reporter?: Reporter;
}

/** Warnings already given, so a dev server that reads decks again says each once. */
const warned = new Set<string>();

const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";

function parseSlideData(data: Record<string, unknown>, file: string): SlideData {
	const result = slideSchema.safeParse(data);
	if (result.success) return result.data;
	const issues = result.error.issues
		.map((i) => `${i.path.join(".") || "<root>"} — ${i.message}`)
		.join("; ");
	throw new Error(`${file}: invalid frontmatter: ${issues}`);
}

/** Read one deck folder. */
export async function readDeck(dir: string, options: ReadDeckOptions = {}): Promise<Deck> {
	const keepScripts = options.slideScripts ?? false;
	const clean = (html: string) => (keepScripts ? html : stripSlideScripts(html));
	let render: SlideMarkdownRenderer | undefined =
		typeof options.markdown === "function" ? options.markdown : undefined;
	const markdown = async (source: string) => {
		render ??= await createSlideMarkdownRenderer(
			typeof options.markdown === "object" ? options.markdown : {},
		);
		return render(source);
	};

	const slides: Omit<DeckSlide, "number">[] = [];
	for (const file of await filesIn(
		dir,
		(name) => SLIDE_EXTENSION.test(name) || PPTX_EXTENSION.test(name),
	)) {
		if (PPTX_EXTENSION.test(file)) {
			const { pptxToSlides } = await import("../pptx/index");
			const pages = pptxToSlides(await readFile(join(dir, file)), {
				...(options.pptxMedia ? { media: options.pptxMedia } : {}),
			});
			for (const page of pages.slides) {
				const data = parseSlideData(
					{ title: page.title, notes: page.notes || undefined, hidden: page.hidden },
					file,
				);
				const html = clean(page.html);
				slides.push({
					id: pptxSlideId(file, page.index),
					file,
					format: "pptx",
					data,
					body: page.html,
					html,
					title: slideTitle({ data, body: page.html }),
					notes: data.notes,
				});
			}
			continue;
		}
		const raw = await readFile(join(dir, file), "utf-8");
		const { data: frontmatter, body } = splitFrontmatter(raw);
		const data = parseSlideData(frontmatter, file);
		const warning = deprecatedClassWarning(`${basename(dir)}/${file}`, data.class);
		if (warning && !warned.has(warning)) {
			warned.add(warning);
			(options.reporter ?? consoleReporter).warn(warning);
		}
		const format: SlideFormat = HTML_EXTENSION.test(file)
			? "html"
			: /\.mdx$/i.test(file)
				? "mdx"
				: "md";
		// Trailing-comment notes, in every format (compileSlideMdx drops the comment from MDX).
		const commentNotes = extractCommentNotes(body);
		let html: string | undefined;
		if (format === "html") html = clean(htmlWithoutNotes(body));
		else if (format === "md") {
			const rendered = await markdown(body);
			html = clean(
				(commentNotes === undefined ? null : withoutNotesComment(rendered, commentNotes)) ??
					rendered,
			);
		}
		slides.push({
			id: toEntryId(file),
			file,
			format,
			data,
			body,
			...(html === undefined ? {} : { html }),
			title: slideTitle({ data, body }),
			notes: data.notes ?? commentNotes,
		});
	}
	// The order an Astlide site uses: by id.
	slides.sort((a, b) => a.id.localeCompare(b.id));
	return {
		name: basename(dir),
		...(await readDeckConfig(dir)),
		slides: slides.map((s, i) => ({ ...s, number: i + 1 })),
	};
}

/** Read every deck folder in `base` (default layout: `src/content/decks`). */
export async function readDecks(base: string, options: ReadDeckOptions = {}): Promise<Deck[]> {
	let entries: import("node:fs").Dirent[];
	try {
		entries = await readdir(base, { withFileTypes: true });
	} catch (e) {
		if (missing(e)) return [];
		throw e;
	}
	// One renderer for all decks.
	const shared: ReadDeckOptions =
		typeof options.markdown === "function"
			? options
			: {
					...options,
					markdown: await createSlideMarkdownRenderer(
						typeof options.markdown === "object" ? options.markdown : {},
					),
				};
	const decks: Deck[] = [];
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
		const deck = await readDeck(join(base, entry.name), shared);
		if (deck.slides.length > 0) decks.push(deck);
	}
	return decks;
}
