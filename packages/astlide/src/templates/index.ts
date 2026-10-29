/**
 * A place to keep PowerPoint templates by name, with every uploaded version:
 * in a folder, in S3 (or R2, MinIO …), or in any storage you plug in. The
 * render service keeps its templates here; any other tool can too.
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

import { createTemplateStore } from "./folder";
import { createS3TemplateStore } from "./s3";
import { type TemplateStore, TemplateStoreError } from "./store";

export { createTemplateStore, folderStorage } from "./folder";
export { createS3TemplateStore, type S3StorageOptions, s3Storage } from "./s3";
export {
	createObjectTemplateStore,
	type ObjectStorage,
	type PutTemplateOptions,
	type StoredTemplate,
	TEMPLATE_EXTENSIONS,
	type TemplateExtension,
	type TemplateInfo,
	type TemplateStore,
	TemplateStoreError,
	type TemplateVersion,
	templateNameError,
} from "./store";

/**
 * A store from a location: a folder path, or `s3://<bucket>/<prefix>`. For
 * S3, the credentials and settings come from the usual AWS variables in
 * `env`: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`,
 * `AWS_REGION` (or `AWS_DEFAULT_REGION`) and, for R2, MinIO and the like,
 * `AWS_ENDPOINT_URL_S3` (or `AWS_ENDPOINT_URL`).
 *
 * @example
 * ```ts
 * openTemplateStore("./templates");
 * openTemplateStore("s3://acme-assets/astlide/templates");
 * ```
 */
export function openTemplateStore(
	location: string,
	env: Record<string, string | undefined> = process.env,
): TemplateStore {
	if (!location.startsWith("s3://")) return createTemplateStore(location);
	const [bucket, ...rest] = location.slice("s3://".length).split("/");
	if (!bucket) throw new TemplateStoreError(`no bucket in "${location}" (s3://<bucket>/<prefix>)`);
	const accessKeyId = env.AWS_ACCESS_KEY_ID;
	const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
	if (!accessKeyId || !secretAccessKey)
		throw new TemplateStoreError(`${location} needs AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY`);
	return createS3TemplateStore({
		bucket,
		prefix: rest.join("/"),
		region: env.AWS_REGION || env.AWS_DEFAULT_REGION || undefined,
		endpoint: env.AWS_ENDPOINT_URL_S3 || env.AWS_ENDPOINT_URL || undefined,
		accessKeyId,
		secretAccessKey,
		sessionToken: env.AWS_SESSION_TOKEN || undefined,
	});
}
