/**
 * Templates in Amazon S3, or any service with an S3-compatible API
 * (Cloudflare R2, MinIO …), through the AWS SDK (`@aws-sdk/client-s3`).
 *
 * @module
 */

import type { S3Client, S3ClientConfig } from "@aws-sdk/client-s3";
import { errorCode, lazySdk, normalizePrefix } from "./sdk";
import { createObjectTemplateStore, type ObjectStorage, type TemplateStore } from "./store";

export interface S3StorageOptions {
	bucket: string;
	/** A key prefix, e.g. `astlide/templates`. */
	prefix?: string;
	/**
	 * A client of your own. Without it, one is made from `config`: credentials
	 * then come from the AWS SDK's usual chain (environment variables, shared
	 * config files, IAM roles for EC2 / ECS / EKS …).
	 */
	client?: S3Client;
	/** For the client made here: `region`, `endpoint`, `forcePathStyle` … */
	config?: S3ClientConfig;
}

const sdk = lazySdk("@aws-sdk/client-s3", () => import("@aws-sdk/client-s3"));

/** An {@link ObjectStorage} in an S3 bucket. */
export function s3Storage(options: S3StorageOptions): ObjectStorage {
	const prefix = normalizePrefix(options.prefix);
	const Bucket = options.bucket;
	let client: Promise<S3Client> | undefined;
	const s3 = () => {
		client ??= sdk().then(({ S3Client }) => options.client ?? new S3Client(options.config ?? {}));
		return client;
	};
	return {
		async read(key) {
			const { GetObjectCommand } = await sdk();
			try {
				const res = await (await s3()).send(new GetObjectCommand({ Bucket, Key: prefix + key }));
				return res.Body ? await res.Body.transformToByteArray() : new Uint8Array();
			} catch (e) {
				// Only a missing object: a missing bucket (also a 404) is an error.
				if (errorCode(e) === "NoSuchKey") return undefined;
				throw e;
			}
		},
		async write(key, data) {
			const { PutObjectCommand } = await sdk();
			await (await s3()).send(new PutObjectCommand({ Bucket, Key: prefix + key, Body: data }));
		},
		async delete(key) {
			const { DeleteObjectCommand } = await sdk();
			await (await s3()).send(new DeleteObjectCommand({ Bucket, Key: prefix + key }));
		},
		async list(sub) {
			const { ListObjectsV2Command } = await sdk();
			const keys: string[] = [];
			let ContinuationToken: string | undefined;
			do {
				const res = await (await s3()).send(
					new ListObjectsV2Command({ Bucket, Prefix: prefix + sub, ContinuationToken }),
				);
				for (const { Key } of res.Contents ?? [])
					if (Key?.startsWith(prefix)) keys.push(Key.slice(prefix.length));
				ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
			} while (ContinuationToken);
			return keys;
		},
	};
}

/** A {@link TemplateStore} in an S3 bucket. */
export function createS3TemplateStore(options: S3StorageOptions): TemplateStore {
	return createObjectTemplateStore(s3Storage(options));
}
