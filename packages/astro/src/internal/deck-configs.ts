/**
 * The decks' `_config.json`, read from where their slides are: the folder the
 * content loader read them from (its `base`, under the project's `srcDir`),
 * whatever directory Astro runs in.
 *
 * @module
 */

import { join, resolve, sep } from "node:path";
import { readDeckConfig } from "@astlide/core/deck/files";
import type { DeckConfig } from "@astlide/core/schema";

/** The project root (the integration defines it). */
declare const __ASTLIDE_ROOT__: string | undefined;

/** What a slide entry tells about its file. */
interface SlideEntry {
	id: string;
	/** Relative to the project root. */
	filePath?: string;
}

/**
 * Each deck's folder, by deck name, found from its slides' files: a slide
 * `tour/01-intro` at `<root>/<base>/tour/01-intro.mdx` puts the deck at
 * `<root>/<base>/tour` (a .pptx file's pages, `tour/03--007`, come from `tour/03.pptx`).
 */
export function deckFolders(entries: SlideEntry[]): Map<string, string> {
	const root = typeof __ASTLIDE_ROOT__ === "string" ? __ASTLIDE_ROOT__ : process.cwd();
	const folders = new Map<string, string>();
	for (const entry of entries) {
		const deck = entry.id.split("/")[0];
		if (!deck || folders.has(deck) || !entry.filePath) continue;
		const file = resolve(root, entry.filePath).replace(/\.[^./\\]+$/, "");
		for (const id of [entry.id, entry.id.replace(/--\d{3}$/, "")]) {
			const rel = id.split("/").join(sep);
			if (file.endsWith(sep + rel)) {
				folders.set(deck, join(file.slice(0, file.length - rel.length), deck));
				break;
			}
		}
	}
	return folders;
}

/** Each deck's config (with defaults), and why its `_config.json` couldn't be used. */
export async function deckConfigs(
	entries: SlideEntry[],
): Promise<Map<string, { config: DeckConfig; configIssue?: string }>> {
	const configs = new Map<string, { config: DeckConfig; configIssue?: string }>();
	for (const [deck, folder] of deckFolders(entries))
		configs.set(deck, await readDeckConfig(folder));
	return configs;
}

/**
 * A deck's `date` for the index page, as a calendar date in English
 * (`Jan 15, 2024`), the same wherever the site is built: a `YYYY-MM-DD` start
 * is taken as written, not as UTC midnight moved into the build machine's
 * timezone. Null when it isn't a date.
 */
export function deckDate(raw: string | undefined): string | null {
	if (!raw) return null;
	const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
	const date = ymd
		? new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])))
		: new Date(raw);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString("en", {
		timeZone: "UTC",
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}
