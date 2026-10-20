import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The file a root-relative URL of the built site names, in `distDir`. When
 * the site has a `base` (Astro's, e.g. `/my-repo/` on GitHub Pages), URLs
 * carry it but `dist/` doesn't: leading path segments are dropped until a
 * file is found. Null when there's none (or the path leaves `distDir`).
 */
export function distFile(distDir: string, url: string): string | null {
	const path = (url.split(/[?#]/)[0] ?? "").replace(/^\/+/, "");
	let segments: string[];
	try {
		segments = decodeURIComponent(path).split("/");
	} catch {
		segments = path.split("/");
	}
	const root = resolve(distDir);
	for (let i = 0; i < segments.length; i++) {
		const file = resolve(root, ...segments.slice(i));
		if (!file.startsWith(root)) return null;
		if (existsSync(file) && statSync(file).isFile()) return file;
	}
	return null;
}
