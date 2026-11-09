/**
 * Where an Astlide project keeps its decks: `src/content/decks/<deck>/`, each
 * with an optional `_config.json`. Used by the CLI and the exporters.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { decksDir } from "./files";

export { decksDir } from "./files";

/** The deck names in a project: the folders in its decks folder. */
export async function listDecks(root: string): Promise<string[]> {
	const entries = await readdir(decksDir(root), { withFileTypes: true });
	return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/** A deck's `_config.json` (title, author, theme), or `{}` when it has none or it can't be read. */
export async function readDeckConfigFile(
	root: string,
	deck: string,
): Promise<Record<string, unknown>> {
	try {
		return JSON.parse(
			await readFile(join(decksDir(root), deck, "_config.json"), "utf-8"),
		) as Record<string, unknown>;
	} catch {
		return {};
	}
}
