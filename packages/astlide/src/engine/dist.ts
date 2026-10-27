import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

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
		if (!isInside(root, file)) return null;
		if (existsSync(file) && statSync(file).isFile()) return file;
	}
	return null;
}

/** `path` with symlinks resolved, as far as it exists (the rest appended as is). */
function realPath(path: string): string {
	const abs = resolve(path);
	if (existsSync(abs)) return realpathSync.native(abs);
	const parent = dirname(abs);
	return parent === abs ? abs : join(realPath(parent), relative(parent, abs));
}

const within = (dir: string, file: string) => {
	const rel = relative(dir, file);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/**
 * Whether `file` is `dir` itself or inside it (not merely a path sharing its
 * prefix, like `dist-old`) — also once symlinks are followed, so a link in
 * `dist/` (say, in a committed build of someone else's project) can't point
 * reads at files elsewhere.
 */
export function isInside(dir: string, file: string): boolean {
	return within(resolve(dir), resolve(file)) && within(realPath(dir), realPath(file));
}
