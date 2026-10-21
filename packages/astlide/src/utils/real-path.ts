/**
 * Path containment with symlinks resolved: a folder that is a symlink to
 * somewhere else is not "inside" the folder it sits in.
 *
 * @module
 */

import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * `path` with symlinks resolved, as far as it exists (the rest appended as
 * is). The native resolution also gives the on-disk letter case, so paths on
 * case-insensitive file systems compare equal.
 */
export function realPath(path: string): string {
	const abs = resolve(path);
	if (existsSync(abs)) return realpathSync.native(abs);
	const parent = dirname(abs);
	return parent === abs ? abs : join(realPath(parent), relative(parent, abs));
}

/** Whether `path` is `dir` or inside it, after resolving symlinks in both. */
export function isWithin(path: string, dir: string): boolean {
	const rel = relative(realPath(dir), realPath(path));
	return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
