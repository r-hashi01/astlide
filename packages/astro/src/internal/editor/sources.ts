/**
 * The slide files the editor may read and write: existing `.mdx` / `.md` /
 * `.html` files inside the decks folder, and request bodies of bounded size.
 *
 * @module
 */

import { realpath, stat } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { isAbsolute, relative, resolve, sep } from "node:path";

const SLIDE_SOURCE = /\.(mdx|md|html)$/i;

const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Resolve a slide path from the client (relative to `root`) to an absolute
 * file path, or `null` if it isn't an editable slide source inside `dir`
 * (default `<root>/src/`).
 */
export function resolveSlideSource(
	root: string,
	path: unknown,
	dir = resolve(root, "src"),
): string | null {
	if (typeof path !== "string" || path.length === 0 || path.includes("\0")) return null;
	if (!SLIDE_SOURCE.test(path)) return null;
	const srcDir = resolve(dir);
	const absolute = resolve(root, path);
	const rel = relative(srcDir, absolute);
	if (
		rel === "" ||
		rel.startsWith("..") ||
		rel.startsWith(sep) ||
		isAbsolute(rel) ||
		resolve(srcDir, rel) !== absolute
	) {
		return null;
	}
	return absolute;
}

/**
 * The real path of the slide source `path` names, or `null` unless it is an
 * existing file inside `decksDir` once symlinks are followed (see
 * {@link resolveSlideSource} for the name rules). The editor only ever edits
 * slides that exist: it never creates a file.
 */
export async function editableSource(
	root: string,
	decksDir: string,
	path: unknown,
): Promise<string | null> {
	const file = resolveSlideSource(root, path, decksDir);
	if (!file) return null;
	try {
		const [real, decks] = await Promise.all([realpath(file), realpath(decksDir)]);
		if (!real.startsWith(decks + sep) || !SLIDE_SOURCE.test(real)) return null;
		return (await stat(real)).isFile() ? real : null;
	} catch {
		return null;
	}
}

export async function readBody(req: IncomingMessage): Promise<string> {
	let size = 0;
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		size += chunk.length;
		if (size > MAX_BODY_BYTES) throw new Error("Body too large");
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString("utf-8");
}
