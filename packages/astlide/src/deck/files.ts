/**
 * Slide files on disk, shared by the Astro loader and the framework-agnostic
 * deck reader: where decks live, which files are slides, their ids,
 * frontmatter and notes.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { load as parseYaml } from "js-yaml";
import { type DeckConfig, deckConfigSchema } from "../schema";
import { extractCommentNotes, withoutNotesComment } from "../utils/comment-notes";

/** Where a project keeps its decks, from its root: one folder per deck. */
export const DECKS_DIR = "src/content/decks";

/** The decks folder of a project at `root`. */
export function decksDir(root: string): string {
	return join(root, DECKS_DIR);
}

/** The decks folder under an Astro project's `srcDir`. */
export function decksDirIn(srcDir: string): string {
	return join(srcDir, "content", "decks");
}

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

/**
 * An error when slide files share a name and differ only in extension
 * (`03-intro.md` and `03-intro.html`): they would be the same slide, so
 * which one shows would depend on the framework. Null when names are unique.
 */
export function sameNameSlides(files: readonly string[]): Error | null {
	const byId = new Map<string, string[]>();
	for (const file of files) {
		if (!SLIDE_EXTENSION.test(file)) continue;
		const id = toEntryId(file);
		byId.set(id, [...(byId.get(id) ?? []), file.replace(/\\/g, "/")]);
	}
	const clashes = [...byId.values()].filter((group) => group.length > 1);
	if (clashes.length === 0) return null;
	return new Error(
		`slides with the same name (only the extension differs): ${clashes
			.map((group) => group.sort().join(" and "))
			.join("; ")} — rename or remove one of each`,
	);
}

/**
 * The files below `dir` whose name passes `test`, relative to it with `/`.
 * Office's lock files for open documents (`~$talk.pptx`) are never slides.
 */
export async function filesIn(dir: string, test: (name: string) => boolean): Promise<string[]> {
	const entries = await readdir(dir, { recursive: true, withFileTypes: true });
	return entries
		.filter((e) => e.isFile() && !e.name.startsWith("~$") && test(e.name))
		.map((e) => relative(dir, join(e.parentPath, e.name)).replace(/\\/g, "/"));
}

/** The id of page `index` (1-based) of a `.pptx` slide file: it sorts among the deck's other files. */
export function pptxSlideId(file: string, index: number): string {
	return `${file.replace(PPTX_EXTENSION, "")}--${String(index).padStart(3, "0")}`;
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

const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";

/**
 * A deck folder's `_config.json`, checked: the config with defaults, and why
 * it couldn't be used when it couldn't (the defaults are used then). No file
 * means the defaults.
 */
export async function readDeckConfig(
	dir: string,
): Promise<{ config: DeckConfig; configIssue?: string }> {
	const defaults = deckConfigSchema.parse({});
	let raw: string;
	try {
		raw = await readFile(join(dir, "_config.json"), "utf-8");
	} catch (e) {
		if (missing(e)) return { config: defaults };
		throw e;
	}
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch (e) {
		return { config: defaults, configIssue: `Malformed _config.json: ${(e as Error).message}` };
	}
	const result = deckConfigSchema.safeParse(json);
	if (result.success) return { config: result.data };
	const issues = result.error.issues
		.map((i) => `${i.path.join(".") || "<root>"} — ${i.message}`)
		.join("; ");
	return { config: defaults, configIssue: `Invalid _config.json: ${issues}` };
}
