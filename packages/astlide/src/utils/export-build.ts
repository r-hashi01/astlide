/**
 * The site build `astlide export` makes for itself: written to its own
 * folder, never to the project's `dist/`, and with speaker notes included
 * (PowerPoint exports keep them) whatever the `notes` option says — so a
 * `dist/` you deploy never picks up notes from an export.
 *
 * @module
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Set (to the export build folder) for the `astro build` / `astro preview`
 * an export runs: the integration then builds into / serves that folder and
 * includes speaker notes.
 */
export const EXPORT_BUILD_ENV = "ASTLIDE_EXPORT_BUILD";

/** Where `astlide export` builds a project (gitignored with node_modules). */
export function exportBuildDir(root: string): string {
	return join(root, "node_modules", ".astro", "astlide-export");
}

/**
 * The built site an export reads: its own build when there is one, else
 * the project's `dist/` (an `astro build`, without speaker notes unless
 * `notes: "public"`).
 */
export function exportSiteDir(root: string): { dir: string; own: boolean } {
	const own = exportBuildDir(root);
	return existsSync(own) ? { dir: own, own: true } : { dir: join(root, "dist"), own: false };
}
