/**
 * Files (pictures, embedded fonts) of `.pptx` slides: written by the deck
 * loader to a cache directory and served by an injected route, so slides
 * reference them by URL instead of inlining them.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * The extension a picture's or font's bytes really are, or undefined when
 * they are neither. The name a `.pptx` gives a file is not trusted: what is
 * stored and served is what the bytes say. Pictures are served as `image/*`,
 * which browsers never run as scripts; fonts aren't covered by that, so a
 * font must start the way only a font does — its first bytes can't begin a
 * script (a NUL right after the tag), so no font/script polyglot gets through.
 */
export function assetExtension(data: Uint8Array): string | undefined {
	const b = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
	const ascii = (start: number, end: number) => b.toString("latin1", start, end);
	if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a)
		return ".png";
	if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ".jpg";
	if (b.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return ".gif";
	if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return ".webp";
	if (b.length >= 2 && ascii(0, 2) === "BM") return ".bmp";
	if (b.length >= 12) {
		if (b.readUInt32BE(0) === 0x00010000) return ".ttf";
		const tag = ascii(0, 4);
		if ((tag === "true" || tag === "ttcf") && b[4] === 0) return ".ttf";
		if (tag === "OTTO" && b[4] === 0) return ".otf";
	}
	return undefined;
}

/** Stored asset file names referenced in `text` (as `…/_astlide/pptx/<name>` URLs). */
export function referencedAssets(text: string): string[] {
	return [...text.matchAll(/\/_astlide\/pptx\/([0-9a-f]{24}\.[a-z0-9]+)/g)].map(
		(m) => m[1] as string,
	);
}

/** Where the loader writes them, for a project root. */
export function pptxAssetDir(root: URL | string): string {
	const dir = typeof root === "string" ? root : fileURLToPath(root);
	return join(dir, "node_modules", ".astro", "astlide-pptx");
}

/**
 * Store a file under its content hash (same bytes → same file, across decks
 * and rebuilds) and return its URL under `base` — or null, storing nothing,
 * when its bytes aren't a picture or font ({@link assetExtension}).
 */
export function storePptxAsset(
	dir: string,
	base: string,
	file: { name: string; data: Buffer },
): string | null {
	const ext = assetExtension(file.data);
	if (!ext) return null;
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
