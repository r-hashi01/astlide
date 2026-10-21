/**
 * Astlide deck loader — an Astro content-collection loader that renders slides
 * authored as **MDX, Markdown, or plain HTML** from a single deck directory.
 *
 * MDX and Markdown are delegated to Astro's built-in `glob` loader (so the MDX
 * compiler pipeline and HMR keep working); `.html` files are ingested directly
 * by storing their body as pre-rendered content. Entry IDs share one scheme
 * across all three formats, so numbered files interleave and sort correctly
 * regardless of extension.
 *
 * @example
 * ```ts
 * // src/content.config.ts
 * import { defineCollection } from 'astro:content';
 * import { astlideDeckLoader, slideSchema } from '@astlide/core';
 *
 * const decks = defineCollection({
 *   loader: astlideDeckLoader(),
 *   schema: slideSchema,
 * });
 *
 * export const collections = { decks };
 * ```
 *
 * A `.html` slide may carry the same frontmatter as an `.mdx` slide:
 * ```html
 * ---
 * slideLayout: cover
 * background: "#0b132b"
 * ---
 * <h1>Everything in one HTML file</h1>
 * <p>Author slides however you like.</p>
 * ```
 */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Loader, LoaderContext } from "astro/loaders";
import { glob } from "astro/loaders";
import { load as parseYaml } from "js-yaml";
import {
	extractCommentNotes,
	stripTrailingComment,
	withoutNotesComment,
} from "./utils/comment-notes";
import { pptxAssetDir, storePptxAsset } from "./utils/pptx-assets";
import { SLIDE_SCRIPTS_VERSION, slideScriptsKept, stripSlideScripts } from "./utils/slide-scripts";

/** Options for {@link astlideDeckLoader}. */
export interface AstlideDeckLoaderOptions {
	/**
	 * Directory holding deck folders, relative to the project root.
	 * Default: `"src/content/decks"`.
	 */
	base?: string;
}

/** Extensions this loader treats as slides. */
const SLIDE_EXTENSION = /\.(?:mdx|md|html?)$/i;
const HTML_EXTENSION = /\.html?$/i;
const PPTX_EXTENSION = /\.pptx$/i;

/**
 * Derive a stable, extension-less entry ID from a path relative to the deck base.
 * Shared by the MDX/Markdown glob delegate and the HTML ingester so that, e.g.,
 * `example-deck/03-slide.html` and `example-deck/04-slide.mdx` sort together.
 */
function toEntryId(relPath: string): string {
	return relPath.replace(/\\/g, "/").replace(SLIDE_EXTENSION, "");
}

/** Split a leading `---\nYAML\n---` frontmatter block from an HTML slide body. */
function splitFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
	if (!match) return { data: {}, body: raw };
	const parsed = parseYaml(match[1]);
	const data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
	return { data, body: raw.slice(match[0].length) };
}

/**
 * `context` whose store removes scripts from the rendered HTML of every
 * Markdown, HTML and PowerPoint slide it is given (see utils/slide-scripts) —
 * also the updates Astro's own Markdown loader makes later in `astro dev`.
 * MDX slides are code and are left alone.
 *
 * @internal
 */
export function withoutSlideScripts(context: LoaderContext): LoaderContext {
	const { store } = context;
	// Entries cleaned by this version carry it in their digest; others (cached
	// before, or with `slideScripts` on) look changed, so they are rendered again.
	const MARK = `:scripts-${SLIDE_SCRIPTS_VERSION}`;
	const content = (filePath: string | undefined) => !!filePath && !/\.mdx$/i.test(filePath);
	const set: typeof store.set = (entry) => {
		const html = entry.rendered?.html;
		if (typeof html !== "string" || !entry.rendered || !content(entry.filePath))
			return store.set(entry);
		return store.set({
			...entry,
			rendered: { ...entry.rendered, html: stripSlideScripts(html) },
			digest: entry.digest === undefined ? undefined : `${entry.digest}${MARK}`,
		});
	};
	const get = ((key: string) => {
		const entry = store.get(key);
		if (!entry || typeof entry.digest !== "string" || !content(entry.filePath)) return entry;
		return entry.digest.endsWith(MARK)
			? { ...entry, digest: entry.digest.slice(0, -MARK.length) }
			: { ...entry, digest: undefined };
	}) as typeof store.get;
	return {
		...context,
		store: new Proxy(store, {
			get: (target, key) => {
				if (key === "set") return set;
				if (key === "get") return get;
				const value = Reflect.get(target, key, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
		}),
	};
}

/** An HTML slide's body without its trailing notes comment. */
function htmlWithoutNotes(body: string): string {
	const notes = extractCommentNotes(body);
	return (notes === undefined ? null : withoutNotesComment(body, notes)) ?? body;
}

/** Guard against re-registering dev watcher listeners each time `load()` re-runs. */
const wiredWatchers = new WeakSet<object>();

/**
 * Create an Astlide deck loader supporting `.mdx`, `.md`, and `.html` slides.
 *
 * @param options - Loader options; see {@link AstlideDeckLoaderOptions}.
 * @returns An Astro content-collection {@link Loader}.
 */
export function astlideDeckLoader(options: AstlideDeckLoaderOptions = {}): Loader {
	const base = options.base ?? "src/content/decks";

	// MDX/Markdown go through Astro's own loader (compiler + HMR). We pin the id
	// generator so HTML entries can share the exact same scheme.
	const markdownLoader = glob({
		pattern: "**/*.{md,mdx}",
		base,
		generateId: ({ entry }) => toEntryId(entry),
	});

	return {
		name: "astlide-deck-loader",
		async load(loaderContext) {
			// Trailing-comment notes never reach the rendered body; scripts in Markdown /
			// HTML / PowerPoint slides only run with `slideScripts: true`.
			const withoutNotes = withoutMarkdownNotes(loaderContext);
			const context = slideScriptsKept() ? withoutNotes : withoutSlideScripts(withoutNotes);
			await markdownLoader.load(context);
			const baseUrl = new URL(`${base.replace(/\/?$/, "/")}`, context.config.root);
			await syncHtmlSlides(context, baseUrl);
			await syncPptxSlides(context, baseUrl);

			// Astro's glob delegate only watches its own `.md`/`.mdx` pattern, so wire
			// HTML files up separately for dev HMR. Reconcile on every relevant change.
			const { watcher } = context;
			if (watcher && !wiredWatchers.has(watcher)) {
				wiredWatchers.add(watcher);
				const onChange = (changedPath: string) => {
					if (HTML_EXTENSION.test(changedPath)) {
						void syncHtmlSlides(context, baseUrl);
					}
					if (PPTX_EXTENSION.test(changedPath)) {
						void syncPptxSlides(context, baseUrl);
					}
				};
				watcher.on("add", onChange);
				watcher.on("change", onChange);
				watcher.on("unlink", onChange);
			}
		},
	};
}

/**
 * `context` with a store that takes the trailing notes comment out of
 * rendered `.md` slides: the notes are read from the entry's raw body and
 * reach pages only when notes are included, so the rendered HTML mustn't
 * carry them. (`.mdx` loses it before compiling, `.html` in
 * {@link syncHtmlSlides}.) The digest changes with it, so entries cached
 * with the comment are replaced.
 */
/** @internal */
export function withoutMarkdownNotes(context: LoaderContext): LoaderContext {
	const { store } = context;
	const MARK = ":notes-out";
	/** The rendered HTML without the notes comment, or null when it has none. */
	const withoutNotes = (entry: { body?: string; rendered?: { html?: string } }) => {
		const notes = entry.body === undefined ? undefined : extractCommentNotes(entry.body);
		const html = entry.rendered?.html;
		return notes === undefined || html === undefined ? null : withoutNotesComment(html, notes);
	};
	const set: typeof store.set = (entry) => {
		const stripped = withoutNotes(entry);
		if (stripped === null || !entry.rendered) return store.set(entry);
		return store.set({
			...entry,
			rendered: { ...entry.rendered, html: stripped },
			digest: entry.digest === undefined ? undefined : `${entry.digest}${MARK}`,
		});
	};
	// The glob loader skips files whose digest matches the stored entry: show it
	// the original digest, and none for an entry cached with the comment still in.
	const get = ((key: string) => {
		const entry = store.get(key);
		if (!entry || typeof entry.digest !== "string") return entry;
		if (entry.digest.endsWith(MARK))
			return { ...entry, digest: entry.digest.slice(0, -MARK.length) };
		// Without a body to read the notes from, any trailing comment counts.
		const cached =
			entry.body === undefined
				? entry.rendered?.html !== undefined && stripTrailingComment(entry.rendered.html) !== null
				: withoutNotes(entry) !== null;
		return cached ? { ...entry, digest: undefined } : entry;
	}) as typeof store.get;
	return {
		...context,
		store: new Proxy(store, {
			get: (target, key) => {
				if (key === "set") return set;
				if (key === "get") return get;
				const value = Reflect.get(target, key, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
		}),
	};
}

/**
 * Every `.pptx` under `baseUrl` (PowerPoint, or Google Slides / Keynote
 * exported as PowerPoint) becomes one slide entry per page, in place: entry
 * ids are the file's (`02-talk.pptx` → `02-talk--001`, `02-talk--002` …), so
 * they sort between their neighbours. Titles, speaker notes and hidden
 * slides carry over; pictures are inlined.
 */
async function syncPptxSlides(context: LoaderContext, baseUrl: URL): Promise<void> {
	const { store, parseData, config, logger } = context;
	const baseDir = fileURLToPath(baseUrl);
	let files: string[];
	try {
		const entries = await readdir(baseDir, { recursive: true, withFileTypes: true });
		files = entries
			.filter((e) => e.isFile() && PPTX_EXTENSION.test(e.name) && !e.name.startsWith("~$"))
			.map((e) => relative(baseDir, `${e.parentPath}/${e.name}`).replace(/\\/g, "/"));
	} catch {
		files = [];
	}
	const seen = new Set<string>();
	if (files.length > 0) {
		const { pptxToSlides } = await import("./pptx/index");
		// Pictures and fonts become files served by the integration (not inlined in every slide).
		const assets = pptxAssetDir(config.root);
		const media = (file: { name: string; data: Buffer }) =>
			storePptxAsset(assets, config.base ?? "/", file);
		for (const relPath of files) {
			const fileUrl = new URL(relPath, baseUrl);
			const raw = await readFile(fileUrl);
			const filePath = relative(fileURLToPath(config.root), fileURLToPath(fileUrl)).replace(
				/\\/g,
				"/",
			);
			let deck: ReturnType<typeof pptxToSlides>;
			try {
				deck = pptxToSlides(raw, { media });
			} catch (error) {
				logger.warn(`${filePath}: ${error instanceof Error ? error.message : error}`);
				continue;
			}
			const digest = createHash("sha256").update(raw).digest("hex");
			for (const slide of deck.slides) {
				const id = `${relPath.replace(PPTX_EXTENSION, "")}--${String(slide.index).padStart(3, "0")}`;
				seen.add(id);
				const data = await parseData({
					id,
					data: {
						title: slide.title,
						notes: slide.notes || undefined,
						hidden: slide.hidden,
					},
					filePath,
				});
				store.set({
					id,
					data,
					filePath,
					body: slide.html,
					digest: `${digest}:${slide.index}`,
					rendered: { html: slide.html },
				});
			}
		}
	}
	// Remove entries whose .pptx was deleted, or pages it no longer has.
	for (const [id, entry] of store.entries()) {
		if (entry.filePath && PPTX_EXTENSION.test(entry.filePath) && !seen.has(id)) store.delete(id);
	}
}

/**
 * Read every `.html`/`.htm` file under `baseUrl`, store each as a pre-rendered
 * slide entry, and drop store entries whose HTML source has been deleted.
 *
 * The body is stored as written — inline `<style>` and any markup — except
 * that scripts are removed from the rendered HTML unless the integration's
 * `slideScripts` option is on (an HTML slide may be someone else's; see
 * {@link withoutSlideScripts}).
 */
async function syncHtmlSlides(context: LoaderContext, baseUrl: URL): Promise<void> {
	const { store, parseData, generateDigest, config } = context;
	const baseDir = fileURLToPath(baseUrl);

	let files: string[];
	try {
		const entries = await readdir(baseDir, { recursive: true, withFileTypes: true });
		files = entries
			.filter((e) => e.isFile() && HTML_EXTENSION.test(e.name))
			.map((e) => relative(baseDir, `${e.parentPath}/${e.name}`).replace(/\\/g, "/"));
	} catch {
		// Base directory missing — the integration already warns about this.
		files = [];
	}

	const seen = new Set<string>();
	for (const relPath of files) {
		const id = toEntryId(relPath);
		seen.add(id);
		const fileUrl = new URL(relPath, baseUrl);
		const raw = await readFile(fileUrl, "utf-8");
		const { data, body } = splitFrontmatter(raw);
		const filePath = relative(fileURLToPath(config.root), fileURLToPath(fileUrl)).replace(
			/\\/g,
			"/",
		);
		const parsed = await parseData({ id, data, filePath });
		store.set({
			id,
			data: parsed,
			filePath,
			body,
			digest: generateDigest(raw),
			// `render(entry)` returns a component that emits this HTML directly —
			// without the trailing notes comment, which is read from `body`.
			rendered: { html: htmlWithoutNotes(body) },
		});
	}

	// Remove entries whose backing `.html` file has been deleted.
	for (const [id, entry] of store.entries()) {
		if (entry.filePath && HTML_EXTENSION.test(entry.filePath) && !seen.has(id)) {
			store.delete(id);
		}
	}
}
