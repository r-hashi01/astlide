/**
 * Files (pictures, embedded fonts) of `.pptx` slides: written by the deck
 * loader to a cache directory and served by an injected route, so slides
 * reference them by URL instead of inlining them.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** URL path the files are served under (after Astro's `base`). */
export const PPTX_ASSET_ROUTE = "/_astlide/pptx";

/**
 * Content types by extension, for the files the importer emits. No SVG: the
 * importer inlines SVG pictures, and the route serves nothing that can run
 * script on the site's origin.
 */
export const PPTX_ASSET_TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".bmp": "image/bmp",
	".ttf": "font/ttf",
	".otf": "font/otf",
};

/** Where the loader writes them, for a project root. */
export function pptxAssetDir(root: URL | string): string {
	const dir = typeof root === "string" ? root : fileURLToPath(root);
	return join(dir, "node_modules", ".astro", "astlide-pptx");
}

/**
 * Store a file under its content hash (same bytes → same file, across decks
 * and rebuilds) and return its URL under `base`.
 */
export function storePptxAsset(
	dir: string,
	base: string,
	file: { name: string; data: Buffer },
): string {
	const ext = extname(file.name).toLowerCase();
	const name = `${createHash("sha256").update(file.data).digest("hex").slice(0, 24)}${ext}`;
	const path = join(dir, name);
	if (!existsSync(path)) {
		mkdirSync(dir, { recursive: true });
		writeFileSync(path, file.data);
	}
	return `${trimTrailingSlashes(base)}${PPTX_ASSET_ROUTE}/${name}`;
}

/** `value` without trailing slashes (a loop: a regex like /\/+$/ backtracks on long runs of slashes). */
function trimTrailingSlashes(value: string): string {
	let end = value.length;
	while (end > 0 && value.charCodeAt(end - 1) === 47) end--;
	return value.slice(0, end);
}
