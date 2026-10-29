/**
 * Templates in a folder on disk.
 *
 * @module
 */

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createObjectTemplateStore, type ObjectStorage, type TemplateStore } from "./store";

const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";

/** An {@link ObjectStorage} in `dir`: each key is a file path under it. */
export function folderStorage(dir: string): ObjectStorage {
	const root = resolve(dir);
	const path = (key: string) => {
		const file = resolve(root, key);
		if (!file.startsWith(root + sep)) throw new Error(`key outside the folder: ${key}`);
		return file;
	};
	return {
		async read(key) {
			try {
				return new Uint8Array(await readFile(path(key)));
			} catch (e) {
				if (missing(e)) return undefined;
				throw e;
			}
		},
		async write(key, data) {
			const file = path(key);
			await mkdir(dirname(file), { recursive: true });
			// Through a temporary file, so a reader never sees half a file.
			const tmp = `${file}.${randomUUID()}.tmp`;
			await writeFile(tmp, data);
			await rename(tmp, file);
		},
		async delete(key) {
			const file = path(key);
			await rm(file, { force: true });
			// Drop the template's folder once it is empty.
			await rmdir(dirname(file)).catch(() => {});
		},
		async list(prefix) {
			const files = await readdir(root, { recursive: true, withFileTypes: true }).catch((e) => {
				if (missing(e)) return [];
				throw e;
			});
			return files
				.filter((f) => f.isFile() && !f.name.endsWith(".tmp"))
				.map((f) => relative(root, join(f.parentPath, f.name)).split(sep).join("/"))
				.filter((key) => key.startsWith(prefix));
		},
	};
}

/**
 * A {@link TemplateStore} in a folder: one folder per template, holding a
 * `manifest.json` and one file per version (`v1.potx`, `v2.pptx` …).
 */
export function createTemplateStore(dir: string): TemplateStore {
	return createObjectTemplateStore(folderStorage(dir));
}
