/**
 * A place to keep PowerPoint templates by name, with every uploaded version:
 * in a folder, in Amazon S3 (or R2, MinIO …), Google Cloud Storage, Azure
 * Blob Storage, or any storage you plug in. The render service keeps its
 * templates here; any other tool can too.
 *
 * ```ts
 * import { openTemplateStore } from "@astlide/core/templates";
 *
 * const store = openTemplateStore("gs://acme-assets/astlide/templates");
 * await store.put("acme", await readFile("acme.potx"), { ext: ".potx", label: "Acme 2026" });
 * const latest = await store.get("acme"); // { info, version, data }
 * ```
 *
 * The cloud storages use each provider's SDK, installed separately:
 * `@aws-sdk/client-s3`, `@google-cloud/storage`, `@azure/storage-blob` (with
 * `@azure/identity` for Microsoft Entra ID sign-in). The files are kept as
 * uploaded; read one with `pptxToTemplate()` from `@astlide/core/pptx`.
 *
 * @module
 */

import { createAzureBlobTemplateStore } from "./azure";
import { createTemplateStore } from "./folder";
import { createGcsTemplateStore } from "./gcs";
import { createS3TemplateStore } from "./s3";
import { type TemplateStore, TemplateStoreError } from "./store";

export {
	type AzureBlobStorageOptions,
	azureBlobStorage,
	createAzureBlobTemplateStore,
} from "./azure";
export { createTemplateStore, folderStorage } from "./folder";
export { createGcsTemplateStore, type GcsStorageOptions, gcsStorage } from "./gcs";
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

/** `scheme://<bucket>/<prefix>` → bucket and prefix. */
function bucketAndPrefix(location: string, scheme: string): [string, string] {
	const [bucket, ...rest] = location.slice(scheme.length).split("/");
	if (!bucket)
		throw new TemplateStoreError(`no bucket in "${location}" (${scheme}<bucket>/<prefix>)`);
	return [bucket, rest.join("/")];
}

/**
 * A store from a location string:
 *
 * - a folder path
 * - `s3://<bucket>/<prefix>`: credentials and region from the AWS SDK's usual
 *   chain; for R2, MinIO and the like, `AWS_ENDPOINT_URL_S3` (bucket in the path)
 * - `gs://<bucket>/<prefix>`: Application Default Credentials;
 *   `STORAGE_EMULATOR_HOST` for an emulator
 * - `azure://<container>/<prefix>`: `AZURE_STORAGE_CONNECTION_STRING`, or
 *   `AZURE_STORAGE_ACCOUNT` with `AZURE_STORAGE_KEY`, `AZURE_STORAGE_SAS_TOKEN`
 *   or a Microsoft Entra ID sign-in (`DefaultAzureCredential`);
 *   `AZURE_STORAGE_BLOB_ENDPOINT` for another endpoint (Azurite, sovereign clouds)
 *
 * Nothing is contacted until the store is used.
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
	if (location.startsWith("s3://")) {
		const [bucket, prefix] = bucketAndPrefix(location, "s3://");
		const endpoint = env.AWS_ENDPOINT_URL_S3 || env.AWS_ENDPOINT_URL;
		return createS3TemplateStore({
			bucket,
			prefix,
			// S3-compatible services: the bucket in the path, and a region they accept.
			config: endpoint
				? {
						endpoint,
						forcePathStyle: true,
						region: env.AWS_REGION || env.AWS_DEFAULT_REGION || "us-east-1",
					}
				: {},
		});
	}
	if (location.startsWith("gs://")) {
		const [bucket, prefix] = bucketAndPrefix(location, "gs://");
		// An emulator (fake-gcs-server …): passed on as the API endpoint, which the SDK handles fully.
		const emulator = env.STORAGE_EMULATOR_HOST || undefined;
		return createGcsTemplateStore({
			bucket,
			prefix,
			config: emulator ? { apiEndpoint: emulator } : undefined,
		});
	}
	if (location.startsWith("azure://")) {
		const [container, prefix] = bucketAndPrefix(location, "azure://");
		const connectionString = env.AZURE_STORAGE_CONNECTION_STRING || undefined;
		const account = env.AZURE_STORAGE_ACCOUNT || undefined;
		if (!connectionString && !account)
			throw new TemplateStoreError(
				`${location} needs AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT`,
			);
		return createAzureBlobTemplateStore({
			container,
			prefix,
			connectionString,
			account,
			accountKey: env.AZURE_STORAGE_KEY || undefined,
			sasToken: env.AZURE_STORAGE_SAS_TOKEN || undefined,
			endpoint: env.AZURE_STORAGE_BLOB_ENDPOINT || undefined,
		});
	}
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(location))
		throw new TemplateStoreError(
			`unknown template store "${location}": use a folder, s3://, gs:// or azure://`,
		);
	return createTemplateStore(location);
}
