/**
 * Templates in Amazon S3, or any service with an S3-compatible API
 * (Cloudflare R2, MinIO …), through the AWS SDK (`@aws-sdk/client-s3`).
 *
 * @module
 */

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
	client?: S3ClientLike;
	/** For the client made here (`S3ClientConfig`): `region`, `endpoint`, `forcePathStyle` … */
	config?: Record<string, unknown>;
}

/** What the store uses of an `S3Client` (from `@aws-sdk/client-s3`). */
export interface S3ClientLike {
	// biome-ignore lint/suspicious/noExplicitAny: commands and results are the SDK's own types
	send(command: any): Promise<any>;
}

type Command = new (input: Record<string, unknown>) => unknown;
/** The parts of `@aws-sdk/client-s3` used here (its types aren't needed to type-check this file). */
interface S3Sdk {
	S3Client: new (config: Record<string, unknown>) => S3ClientLike;
	GetObjectCommand: Command;
	PutObjectCommand: Command;
	DeleteObjectCommand: Command;
	ListObjectsV2Command: Command;
}

const sdk = lazySdk<S3Sdk>("@aws-sdk/client-s3");

/** An {@link ObjectStorage} in an S3 bucket. */
export function s3Storage(options: S3StorageOptions): ObjectStorage {
	const prefix = normalizePrefix(options.prefix);
	const Bucket = options.bucket;
	let client: Promise<S3ClientLike> | undefined;
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
