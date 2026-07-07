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

import { readdir, readFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Loader, LoaderContext } from "astro/loaders";
import { glob } from "astro/loaders";
import { load as parseYaml } from "js-yaml";

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
		async load(context) {
			await markdownLoader.load(context);
			const baseUrl = new URL(`${base.replace(/\/?$/, "/")}`, context.config.root);
			await syncHtmlSlides(context, baseUrl);

			// Astro's glob delegate only watches its own `.md`/`.mdx` pattern, so wire
			// HTML files up separately for dev HMR. Reconcile on every relevant change.
			const { watcher } = context;
			if (watcher && !wiredWatchers.has(watcher)) {
				wiredWatchers.add(watcher);
				const onChange = (changedPath: string) => {
					if (HTML_EXTENSION.test(changedPath)) {
						void syncHtmlSlides(context, baseUrl);
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
 * Read every `.html`/`.htm` file under `baseUrl`, store each as a pre-rendered
 * slide entry, and drop store entries whose HTML source has been deleted.
 *
 * HTML slides are first-party authored files (same trust level as `.mdx`), so
 * the body is stored verbatim — no sanitization — allowing inline `<style>`
 * and markup exactly as MDX slides already allow.
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
			// `render(entry)` returns a component that emits this HTML directly.
			rendered: { html: body },
		});
	}

	// Remove entries whose backing `.html` file has been deleted.
	for (const [id, entry] of store.entries()) {
		if (entry.filePath && HTML_EXTENSION.test(entry.filePath) && !seen.has(id)) {
			store.delete(id);
		}
	}
}
