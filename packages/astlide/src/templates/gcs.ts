/**
 * Templates in Google Cloud Storage, through `@google-cloud/storage`.
 *
 * @module
 */

import type { Storage, StorageOptions } from "@google-cloud/storage";
import { lazySdk, normalizePrefix, statusOf } from "./sdk";
import { createObjectTemplateStore, type ObjectStorage, type TemplateStore } from "./store";

export interface GcsStorageOptions {
	bucket: string;
	/** An object name prefix, e.g. `astlide/templates`. */
	prefix?: string;
	/**
	 * A client of your own. Without it, one is made from `config`: credentials
	 * then come from Application Default Credentials
	 * (`GOOGLE_APPLICATION_CREDENTIALS`, the attached service account on
	 * Cloud Run / GKE / Compute Engine, `gcloud auth application-default login`).
	 */
	storage?: Storage;
	/** For the client made here: `projectId`, `keyFilename` … */
	config?: StorageOptions;
}

const sdk = lazySdk("@google-cloud/storage", () => import("@google-cloud/storage"));

/** An {@link ObjectStorage} in a Cloud Storage bucket. */
export function gcsStorage(options: GcsStorageOptions): ObjectStorage {
	const prefix = normalizePrefix(options.prefix);
	let client: Promise<Storage> | undefined;
	const bucket = async () => {
		client ??= sdk().then(({ Storage }) => options.storage ?? new Storage(options.config));
		return (await client).bucket(options.bucket);
	};
	return {
		async read(key) {
			try {
				const [data] = await (await bucket()).file(prefix + key).download();
				return new Uint8Array(data);
			} catch (e) {
				// Only a missing object: a missing bucket (also a 404) is an error.
				if (statusOf(e) === 404 && !/bucket/i.test((e as Error).message)) return undefined;
				throw e;
			}
		},
		async write(key, data) {
			await (await bucket())
				.file(prefix + key)
				.save(Buffer.from(data), { resumable: false, contentType: "application/octet-stream" });
		},
		async delete(key) {
			await (await bucket()).file(prefix + key).delete({ ignoreNotFound: true });
		},
		async list(sub) {
			const [files] = await (await bucket()).getFiles({ prefix: prefix + sub, autoPaginate: true });
			return files.filter((f) => f.name.startsWith(prefix)).map((f) => f.name.slice(prefix.length));
		},
	};
}

/** A {@link TemplateStore} in a Cloud Storage bucket. */
export function createGcsTemplateStore(options: GcsStorageOptions): TemplateStore {
	return createObjectTemplateStore(gcsStorage(options));
}
