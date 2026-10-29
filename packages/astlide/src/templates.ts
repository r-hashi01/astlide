/**
 * A place to keep PowerPoint templates by name, with every uploaded version.
 * The render service stores its templates here; any other tool can too.
 *
 * ```ts
 * import { createTemplateStore } from "@astlide/core/templates";
 *
 * const store = createTemplateStore("./templates");
 * await store.put("acme", await readFile("acme.potx"), { ext: ".potx", label: "Acme 2026" });
 * const latest = await store.get("acme"); // { info, version, data }
 * ```
 *
 * The files are kept as uploaded; read one with `pptxToTemplate()` from
 * `@astlide/core/pptx`.
 *
 * @module
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { THEMES } from "./schema";

/** File extensions a template can have. */
export const TEMPLATE_EXTENSIONS = [".pptx", ".potx", ".thmx"] as const;
export type TemplateExtension = (typeof TEMPLATE_EXTENSIONS)[number];

/** One uploaded file of a template. */
export interface TemplateVersion {
	/** 1 for the first upload, then 2, 3 … (numbers of deleted versions aren't reused). */
	version: number;
	ext: TemplateExtension;
	/** Size in bytes. */
	size: number;
	/** SHA-256 of the file, hex. */
	sha256: string;
	/** ISO 8601. */
	createdAt: string;
	/** Whatever the caller stored with this version (the render service keeps the layout outline here). */
	meta?: Record<string, unknown>;
}

/** A template and its versions, oldest first. */
export interface TemplateInfo {
	name: string;
	label?: string;
	/** The newest version's number. */
	latest: number;
	versions: TemplateVersion[];
	/** ISO 8601: when a version was last added or removed, or the label changed. */
	updatedAt: string;
}

/** A version with its file. */
export interface StoredTemplate {
	info: TemplateInfo;
	version: TemplateVersion;
	data: Uint8Array;
}

export interface PutTemplateOptions {
	ext: TemplateExtension;
	/** A display name; kept when not given. */
	label?: string;
	meta?: Record<string, unknown>;
}

/**
 * Templates by name. {@link createTemplateStore} keeps them in a folder;
 * implement this to keep them somewhere else (S3, a database …).
 */
export interface TemplateStore {
	/** Every template, by name. */
	list(): Promise<TemplateInfo[]>;
	/** A template's versions, or undefined when there is no such template. */
	info(name: string): Promise<TemplateInfo | undefined>;
	/** The latest version (or `version`) with its file, or undefined when missing. */
	get(name: string, version?: number): Promise<StoredTemplate | undefined>;
	/** Add a version (creating the template on its first upload). */
	put(name: string, data: Uint8Array, options: PutTemplateOptions): Promise<TemplateInfo>;
	/**
	 * Remove one version, or the whole template without `version`. Removing
	 * the last version removes the template. False when there was nothing to remove.
	 */
	remove(name: string, version?: number): Promise<boolean>;
}

/** Names are slugs, so they can be theme names and URL segments. */
const NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** Why `name` can't name a template, or undefined when it can. */
export function templateNameError(name: string): string | undefined {
	if (!NAME.test(name))
		return "a template name is 1–64 lowercase letters, digits and hyphens, starting and ending with a letter or digit";
	if ((THEMES as readonly string[]).includes(name)) return `"${name}" is a built-in theme`;
	return undefined;
}

/** Thrown for a bad name or extension. */
export class TemplateStoreError extends Error {
	override name = "TemplateStoreError";
}

function checkName(name: string): void {
	const error = templateNameError(name);
	if (error) throw new TemplateStoreError(error);
}

const MANIFEST = "manifest.json";

/** What `manifest.json` holds: the info, and the highest version number ever used. */
interface Manifest extends TemplateInfo {
	counter: number;
}

const toInfo = ({ counter: _, ...info }: Manifest): TemplateInfo => info;

/** Write through a temporary file, so a reader never sees half a file. */
async function writeAtomic(file: string, data: string | Uint8Array): Promise<void> {
	const tmp = `${file}.${randomUUID()}.tmp`;
	await writeFile(tmp, data);
	await rename(tmp, file);
}

/**
 * A {@link TemplateStore} in a folder: one folder per template, holding a
 * `manifest.json` and one file per version (`v1.potx`, `v2.pptx` …). Changes
 * within this process are serialized per template; don't point two
 * processes that write at the same folder.
 */
export function createTemplateStore(dir: string): TemplateStore {
	const root = resolve(dir);
	const folder = (name: string) => join(root, name);

	async function readManifest(name: string): Promise<Manifest | undefined> {
		try {
			return JSON.parse(await readFile(join(folder(name), MANIFEST), "utf-8")) as Manifest;
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw e;
		}
	}
	const readInfo = async (name: string) => {
		const manifest = await readManifest(name);
		return manifest && toInfo(manifest);
	};
	const writeManifest = (manifest: Manifest) =>
		writeAtomic(join(folder(manifest.name), MANIFEST), `${JSON.stringify(manifest, null, "\t")}\n`);

	// One change at a time per template.
	const locks = new Map<string, Promise<unknown>>();
	function locked<T>(name: string, fn: () => Promise<T>): Promise<T> {
		const run = (locks.get(name) ?? Promise.resolve()).then(fn, fn);
		const tail = run.catch(() => {});
		locks.set(name, tail);
		void tail.then(() => {
			if (locks.get(name) === tail) locks.delete(name);
		});
		return run;
	}

	return {
		async list() {
			const entries = await readdir(root, { withFileTypes: true }).catch((e) => {
				if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
				throw e;
			});
			const infos = await Promise.all(
				entries.filter((e) => e.isDirectory() && NAME.test(e.name)).map((e) => readInfo(e.name)),
			);
			return infos
				.filter((i): i is TemplateInfo => !!i)
				.sort((a, b) => a.name.localeCompare(b.name));
		},

		async info(name) {
			return templateNameError(name) ? undefined : readInfo(name);
		},

		async get(name, version) {
			if (templateNameError(name)) return undefined;
			const info = await readInfo(name);
			const v = info?.versions.find((x) => x.version === (version ?? info.latest));
			if (!info || !v) return undefined;
			const data = await readFile(join(folder(name), `v${v.version}${v.ext}`));
			return { info, version: v, data: new Uint8Array(data) };
		},

		async put(name, data, options) {
			checkName(name);
			if (!(TEMPLATE_EXTENSIONS as readonly string[]).includes(options.ext))
				throw new TemplateStoreError(
					`a template is a ${TEMPLATE_EXTENSIONS.join(" / ")} file, not "${options.ext}"`,
				);
			return locked(name, async () => {
				await mkdir(folder(name), { recursive: true });
				const now = new Date().toISOString();
				const manifest: Manifest = (await readManifest(name)) ?? {
					name,
					latest: 0,
					versions: [],
					updatedAt: now,
					counter: 0,
				};
				const number = manifest.counter + 1;
				const version: TemplateVersion = {
					version: number,
					ext: options.ext,
					size: data.length,
					sha256: createHash("sha256").update(data).digest("hex"),
					createdAt: now,
					...(options.meta ? { meta: options.meta } : {}),
				};
				// The file first: a manifest never names a version whose file isn't there.
				await writeAtomic(join(folder(name), `v${number}${options.ext}`), data);
				const next: Manifest = {
					...manifest,
					...(options.label !== undefined ? { label: options.label } : {}),
					latest: number,
					versions: [...manifest.versions, version],
					updatedAt: now,
					counter: number,
				};
				await writeManifest(next);
				return toInfo(next);
			});
		},

		async remove(name, version) {
			if (templateNameError(name)) return false;
			return locked(name, async () => {
				const info = await readManifest(name);
				if (!info) return false;
				const gone =
					version === undefined
						? info.versions
						: info.versions.filter((v) => v.version === version);
				if (!gone.length) return false;
				const kept = info.versions.filter((v) => !gone.includes(v));
				if (!kept.length) {
					await rm(folder(name), { recursive: true, force: true });
					return true;
				}
				// The manifest first: a version is never listed without its file.
				// (`counter` stays, so a number never names two files.)
				await writeManifest({
					...info,
					latest: kept[kept.length - 1]?.version ?? 0,
					versions: kept,
					updatedAt: new Date().toISOString(),
				});
				await Promise.all(
					gone.map((v) => rm(join(folder(name), `v${v.version}${v.ext}`), { force: true })),
				);
				return true;
			});
		},
	};
}
