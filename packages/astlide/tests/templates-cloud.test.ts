import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import type { ContainerClient } from "@azure/storage-blob";
import type { Storage } from "@google-cloud/storage";
import { describe, expect, it } from "vitest";
import {
	createAzureBlobTemplateStore,
	createGcsTemplateStore,
	createS3TemplateStore,
	openTemplateStore,
	type TemplateStore,
} from "../src/templates";

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array | undefined) => (b ? new TextDecoder().decode(b) : undefined);
const notFound = () =>
	Object.assign(new Error("The specified blob does not exist."), {
		statusCode: 404,
		code: "BlobNotFound",
	});

/** Objects in memory, listed two per page like a real service would page them. */
const bucket = () => new Map<string, Uint8Array>();

/** A fake S3 client: the four commands the store sends. */
function fakeS3(objects: Map<string, Uint8Array>): S3Client {
	return {
		async send(command: unknown) {
			const input = (command as { input: Record<string, string> }).input;
			if (input.Bucket !== "bucket")
				throw Object.assign(new Error("NoSuchBucket"), {
					$metadata: { httpStatusCode: 404 },
					name: "NoSuchBucket",
				});
			if (command instanceof GetObjectCommand) {
				const data = objects.get(input.Key as string);
				if (!data)
					throw Object.assign(new Error("NoSuchKey"), {
						name: "NoSuchKey",
						$metadata: { httpStatusCode: 404 },
					});
				return { Body: { transformToByteArray: async () => data } };
			}
			if (command instanceof PutObjectCommand) {
				objects.set(
					input.Key as string,
					(command as unknown as { input: { Body: Uint8Array } }).input.Body,
				);
				return {};
			}
			if (command instanceof DeleteObjectCommand) {
				objects.delete(input.Key as string);
				return {};
			}
			if (command instanceof ListObjectsV2Command) {
				const all = [...objects.keys()].filter((k) => k.startsWith(input.Prefix ?? "")).sort();
				const start = Number(input.ContinuationToken ?? 0);
				const more = start + 2 < all.length;
				return {
					Contents: all.slice(start, start + 2).map((Key) => ({ Key })),
					IsTruncated: more,
					NextContinuationToken: more ? String(start + 2) : undefined,
				};
			}
			throw new Error("unexpected command");
		},
	} as unknown as S3Client;
}

/** A fake Cloud Storage client. */
function fakeGcs(objects: Map<string, Uint8Array>): Storage {
	return {
		bucket: () => ({
			file: (name: string) => ({
				async download() {
					const data = objects.get(name);
					if (!data) throw Object.assign(new Error("No such object"), { code: 404 });
					return [Buffer.from(data)];
				},
				async save(data: Buffer) {
					objects.set(name, new Uint8Array(data));
				},
				async delete() {
					objects.delete(name);
				},
			}),
			async getFiles({ prefix }: { prefix: string }) {
				return [[...objects.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }))];
			},
		}),
	} as unknown as Storage;
}

/** A fake Azure container client. */
function fakeAzure(objects: Map<string, Uint8Array>): ContainerClient {
	return {
		getBlockBlobClient: (name: string) => ({
			async downloadToBuffer() {
				const data = objects.get(name);
				if (!data) throw notFound();
				return Buffer.from(data);
			},
			async uploadData(data: Uint8Array) {
				objects.set(name, new Uint8Array(data));
			},
			async deleteIfExists() {
				objects.delete(name);
			},
		}),
		async *listBlobsFlat({ prefix }: { prefix: string }) {
			for (const name of [...objects.keys()].filter((k) => k.startsWith(prefix))) yield { name };
		},
	} as unknown as ContainerClient;
}

const cases: [string, (objects: Map<string, Uint8Array>) => TemplateStore][] = [
	[
		"S3",
		(o) =>
			createS3TemplateStore({ bucket: "bucket", prefix: "/astlide/templates/", client: fakeS3(o) }),
	],
	[
		"Cloud Storage",
		(o) =>
			createGcsTemplateStore({
				bucket: "bucket",
				prefix: "astlide/templates",
				storage: fakeGcs(o),
			}),
	],
	[
		"Azure Blob Storage",
		(o) =>
			createAzureBlobTemplateStore({
				container: "c",
				prefix: "astlide/templates",
				client: fakeAzure(o),
			}),
	],
];

describe.each(cases)("%s template store", (_, make) => {
	it("keeps versions under the prefix, lists, reads and deletes them", async () => {
		const objects = bucket();
		const store = make(objects);
		await store.put("acme", bytes("one"), { ext: ".potx", label: "Acme" });
		await store.put("acme", bytes("two"), { ext: ".pptx" });
		await store.put("beta", bytes("b"), { ext: ".pptx" });
		expect([...objects.keys()].sort()).toEqual([
			"astlide/templates/acme/manifest.json",
			"astlide/templates/acme/v1.potx",
			"astlide/templates/acme/v2.pptx",
			"astlide/templates/beta/manifest.json",
			"astlide/templates/beta/v1.pptx",
		]);
		expect((await store.list()).map((t) => t.name)).toEqual(["acme", "beta"]);
		expect(text((await store.get("acme"))?.data)).toBe("two");
		expect(text((await store.get("acme", 1))?.data)).toBe("one");
		expect(await store.get("nope")).toBeUndefined();

		expect(await store.remove("acme", 1)).toBe(true);
		expect(objects.has("astlide/templates/acme/v1.potx")).toBe(false);
		expect(await store.remove("acme")).toBe(true);
		expect([...objects.keys()].some((k) => k.includes("/acme/"))).toBe(false);
	});
});

describe("cloud storage errors", () => {
	it("passes errors other than not-found through", async () => {
		const store = createS3TemplateStore({ bucket: "other", client: fakeS3(bucket()) });
		await expect(store.list()).rejects.toThrow(/NoSuchBucket/);
		// A missing bucket isn't a missing template.
		await expect(store.get("acme")).rejects.toThrow(/NoSuchBucket/);
	});
});

describe("openTemplateStore", () => {
	it("picks the storage from the location", () => {
		for (const location of [
			"./templates",
			"s3://bucket/prefix",
			"gs://bucket",
			"azure://container/x",
		])
			expect(openTemplateStore(location, { AZURE_STORAGE_ACCOUNT: "acct" })).toHaveProperty("put");
	});

	it("refuses unknown schemes, missing buckets and Azure without an account", () => {
		expect(() => openTemplateStore("ftp://host/x")).toThrow(/unknown template store/);
		expect(() => openTemplateStore("s3:///prefix")).toThrow(/no bucket/);
		expect(() => openTemplateStore("azure://container", {})).toThrow(/AZURE_STORAGE_ACCOUNT/);
	});

	it("tells which package to install when an SDK is missing", async () => {
		// The SDKs are installed here; the hint's wording is what this checks.
		const { lazySdk } = await import("../src/templates/sdk");
		const load = lazySdk("@example/missing", () => import("@example/missing" as string));
		await expect(load()).rejects.toThrow(
			'needs the "@example/missing" package: bun add @example/missing',
		);
	});
});

describe("normalizePrefix", () => {
	it("trims slashes, in linear time on long runs of them", async () => {
		const { normalizePrefix } = await import("../src/templates/sdk");
		expect(normalizePrefix(undefined)).toBe("");
		expect(normalizePrefix("///")).toBe("");
		expect(normalizePrefix("/a/b/")).toBe("a/b/");
		const started = performance.now();
		expect(normalizePrefix(`${"/".repeat(100_000)}x${"/".repeat(100_000)}`)).toBe("x/");
		expect(normalizePrefix(`a${"/".repeat(100_000)}`)).toBe("a/");
		expect(performance.now() - started).toBeLessThan(100);
	});
});
