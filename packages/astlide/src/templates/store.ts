/**
 * The template store: templates by name, every upload kept as a version, on
 * top of any {@link ObjectStorage}.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { THEMES } from "../schema";

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
 * Templates by name. {@link createObjectTemplateStore} implements it on any
 * {@link ObjectStorage} (a folder, S3, GCS, Azure …); implement it yourself to keep
 * templates some other way (a database …).
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

/**
 * Where a template store keeps its files: keys like `acme/manifest.json` and
 * `acme/v2.potx`. Astlide has one for a folder, S3, Google Cloud Storage and
 * Azure Blob Storage; implement it for any other storage.
 */
export interface ObjectStorage {
	/** The object's bytes, or undefined when there is none. */
	read(key: string): Promise<Uint8Array | undefined>;
	/** Create or replace an object, all at once (a reader never sees half of it). */
	write(key: string, data: Uint8Array): Promise<void>;
	/** Delete an object; deleting a missing one is not an error. */
	delete(key: string): Promise<void>;
	/** Every key that starts with `prefix` (`""` or a path ending in `/`). */
	list(prefix: string): Promise<string[]>;
}

const MANIFEST = "manifest.json";
const MANIFEST_KEY = /^([^/]+)\/manifest\.json$/;

/** What `manifest.json` holds: the info, and the highest version number ever used. */
interface Manifest extends TemplateInfo {
	counter: number;
}

const toInfo = ({ counter: _, ...info }: Manifest): TemplateInfo => info;
const fileKey = (name: string, v: Pick<TemplateVersion, "version" | "ext">) =>
	`${name}/v${v.version}${v.ext}`;

/**
 * A {@link TemplateStore} on `storage`: per template, a `manifest.json` and
 * one object per version (`v1.potx`, `v2.pptx` …). Changes within this
 * process are serialized per template; don't let two processes write to the
 * same storage.
 */
export function createObjectTemplateStore(storage: ObjectStorage): TemplateStore {
	async function readManifest(name: string): Promise<Manifest | undefined> {
		const data = await storage.read(`${name}/${MANIFEST}`);
		return data && (JSON.parse(new TextDecoder().decode(data)) as Manifest);
	}
	const readInfo = async (name: string) => {
		const manifest = await readManifest(name);
		return manifest && toInfo(manifest);
	};
	const writeManifest = (manifest: Manifest) =>
		storage.write(
			`${manifest.name}/${MANIFEST}`,
			new TextEncoder().encode(`${JSON.stringify(manifest, null, "\t")}\n`),
		);

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
			const names = (await storage.list(""))
				.map((key) => key.match(MANIFEST_KEY)?.[1])
				.filter((n): n is string => !!n && NAME.test(n));
			const infos = await Promise.all(names.map(readInfo));
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
			const data = await storage.read(fileKey(name, v));
			return data && { info, version: v, data };
		},

		async put(name, data, options) {
			checkName(name);
			if (!(TEMPLATE_EXTENSIONS as readonly string[]).includes(options.ext))
				throw new TemplateStoreError(
					`a template is a ${TEMPLATE_EXTENSIONS.join(" / ")} file, not "${options.ext}"`,
				);
			return locked(name, async () => {
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
				await storage.write(fileKey(name, version), data);
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
				const manifest = await readManifest(name);
				if (!manifest) return false;
				const gone =
					version === undefined
						? manifest.versions
						: manifest.versions.filter((v) => v.version === version);
				if (!gone.length) return false;
				const kept = manifest.versions.filter((v) => !gone.includes(v));
				if (!kept.length) {
					// The manifest first, then everything else under the name (leftovers included).
					await storage.delete(`${name}/${MANIFEST}`);
					const keys = await storage.list(`${name}/`);
					await Promise.all(keys.map((key) => storage.delete(key)));
					return true;
				}
				// The manifest first: a version is never listed without its file.
				// (`counter` stays, so a number never names two files.)
				await writeManifest({
					...manifest,
					latest: kept[kept.length - 1]?.version ?? 0,
					versions: kept,
					updatedAt: new Date().toISOString(),
				});
				await Promise.all(gone.map((v) => storage.delete(fileKey(name, v))));
				return true;
			});
		},
	};
}
