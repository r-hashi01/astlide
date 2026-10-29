/**
 * Loading a cloud SDK only when its storage is used: the SDKs are optional
 * peer dependencies.
 *
 * @module
 */

import { TemplateStoreError } from "./store";

/** `load()` once, on first use; a missing package becomes an install hint. */
export function lazySdk<T>(name: string, load: () => Promise<T>): () => Promise<T> {
	let loaded: Promise<T> | undefined;
	return () => {
		loaded ??= load().catch((e) => {
			loaded = undefined;
			if (
				(e as { code?: string }).code === "ERR_MODULE_NOT_FOUND" ||
				/Cannot find (module|package)/.test(String(e))
			)
				throw new TemplateStoreError(
					`this template store needs the "${name}" package: bun add ${name}`,
				);
			throw e;
		});
		return loaded;
	};
}

/** A key prefix as stored: no leading slash, one trailing slash (or empty). */
export const normalizePrefix = (prefix: string | undefined) => {
	const trimmed = (prefix ?? "").replace(/^\/+|\/+$/g, "");
	return trimmed ? `${trimmed}/` : "";
};

/** An error's HTTP status, as the SDKs report it. */
export const statusOf = (e: unknown): number | undefined => {
	const err = e as { $metadata?: { httpStatusCode?: number }; code?: unknown; statusCode?: number };
	return (
		err.$metadata?.httpStatusCode ??
		err.statusCode ??
		(typeof err.code === "number" ? err.code : undefined)
	);
};

/** An error's service code (`NoSuchKey`, `BlobNotFound` …), as the SDKs report it. */
export const errorCode = (e: unknown): string | undefined => {
	const err = e as {
		name?: string;
		Code?: string;
		code?: unknown;
		details?: { errorCode?: string };
	};
	return typeof err.code === "string" ? err.code : (err.details?.errorCode ?? err.Code ?? err.name);
};
