import { describe, expect, it } from "vitest";
import { createS3TemplateStore, openTemplateStore, s3Storage } from "../src/templates";
import { signS3Request } from "../src/templates/s3";

// The examples in AWS's "Signature Calculations for the Authorization Header"
// (S3 API reference): same credentials, date and expected signatures.
const aws = {
	region: "us-east-1",
	accessKeyId: "AKIAIOSFODNN7EXAMPLE",
	secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
	date: new Date("2013-05-24T00:00:00Z"),
};
const EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const signature = (headers: Record<string, string>) =>
	headers.authorization?.match(/Signature=([0-9a-f]+)/)?.[1];

describe("signS3Request", () => {
	it("matches AWS's GET Object example", () => {
		const headers = signS3Request({
			...aws,
			method: "GET",
			url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
			headers: { Range: "bytes=0-9" },
			payloadHash: EMPTY,
		});
		expect(headers.authorization).toContain(
			"Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,",
		);
		expect(signature(headers)).toBe(
			"f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
		);
		expect(headers["x-amz-date"]).toBe("20130524T000000Z");
	});

	it("matches AWS's PUT Object example", () => {
		const headers = signS3Request({
			...aws,
			method: "PUT",
			url: new URL("https://examplebucket.s3.amazonaws.com/test%24file.text"),
			headers: {
				Date: "Fri, 24 May 2013 00:00:00 GMT",
				"x-amz-storage-class": "REDUCED_REDUNDANCY",
			},
			payloadHash: "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072",
		});
		expect(signature(headers)).toBe(
			"98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd",
		);
	});

	it("matches AWS's list objects example (query sorted)", () => {
		const headers = signS3Request({
			...aws,
			method: "GET",
			url: new URL("https://examplebucket.s3.amazonaws.com/?prefix=J&max-keys=2"),
			payloadHash: EMPTY,
		});
		expect(signature(headers)).toBe(
			"34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7",
		);
	});

	it("signs the session token", () => {
		const headers = signS3Request({
			...aws,
			sessionToken: "token",
			method: "GET",
			url: new URL("https://examplebucket.s3.amazonaws.com/a"),
			payloadHash: EMPTY,
		});
		expect(headers["x-amz-security-token"]).toBe("token");
		expect(headers.authorization).toContain("x-amz-security-token");
	});
});

/** An in-memory S3: GET / PUT / DELETE objects and ListObjectsV2, two keys per page. */
function fakeS3() {
	const objects = new Map<string, Uint8Array>();
	const requests: { method: string; url: URL; headers: Headers }[] = [];
	const fetch = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
		const url = new URL(String(input));
		const headers = new Headers(init?.headers);
		const method = init?.method ?? "GET";
		requests.push({ method, url, headers });
		if (!headers.get("authorization")?.startsWith("AWS4-HMAC-SHA256 "))
			return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
		const [, bucket, ...rest] = url.pathname.split("/");
		if (bucket !== "bucket")
			return new Response("<Error><Code>NoSuchBucket</Code></Error>", { status: 404 });
		const key = rest.map(decodeURIComponent).join("/");
		if (url.searchParams.get("list-type") === "2") {
			const prefix = url.searchParams.get("prefix") ?? "";
			const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
			const start = Number(url.searchParams.get("continuation-token") ?? 0);
			const page = all.slice(start, start + 2);
			const more = start + 2 < all.length;
			const xml = `<ListBucketResult>${page.map((k) => `<Contents><Key>${k.replace(/&/g, "&amp;")}</Key></Contents>`).join("")}<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${start + 2}</NextContinuationToken>` : ""}</ListBucketResult>`;
			return new Response(xml);
		}
		if (method === "PUT") {
			objects.set(key, new Uint8Array(init?.body as Uint8Array));
			return new Response(null);
		}
		if (method === "DELETE") {
			objects.delete(key);
			return new Response(null, { status: 204 });
		}
		const data = objects.get(key);
		return data
			? new Response(data as BodyInit)
			: new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
	};
	return { objects, requests, fetch: fetch as typeof globalThis.fetch };
}

const credentials = { accessKeyId: "id", secretAccessKey: "secret" };
const bytes = (s: string) => new TextEncoder().encode(s);

describe("S3 template store", () => {
	it("keeps templates under the prefix, path-style on a custom endpoint", async () => {
		const s3 = fakeS3();
		const store = createS3TemplateStore({
			...credentials,
			bucket: "bucket",
			prefix: "/astlide/templates",
			endpoint: "http://localhost:9000",
			fetch: s3.fetch,
		});
		await store.put("acme", bytes("one"), { ext: ".potx", label: "Acme" });
		await store.put("acme", bytes("two"), { ext: ".pptx" });
		await store.put("beta", bytes("b"), { ext: ".pptx" });
		expect([...s3.objects.keys()].sort()).toEqual([
			"astlide/templates/acme/manifest.json",
			"astlide/templates/acme/v1.potx",
			"astlide/templates/acme/v2.pptx",
			"astlide/templates/beta/manifest.json",
			"astlide/templates/beta/v1.pptx",
		]);
		expect(s3.requests[0]?.url.origin).toBe("http://localhost:9000");
		expect(s3.requests[0]?.url.pathname).toBe("/bucket/astlide/templates/acme/manifest.json");

		// Five keys: listing takes three pages.
		expect((await store.list()).map((t) => t.name)).toEqual(["acme", "beta"]);
		expect(new TextDecoder().decode((await store.get("acme"))?.data)).toBe("two");
		expect(new TextDecoder().decode((await store.get("acme", 1))?.data)).toBe("one");

		expect(await store.remove("acme")).toBe(true);
		expect([...s3.objects.keys()].some((k) => k.includes("/acme/"))).toBe(false);
		expect(await store.get("acme")).toBeUndefined();
	});

	it("uses the bucket as the host on AWS", async () => {
		const s3 = fakeS3();
		const storage = s3Storage({
			...credentials,
			bucket: "my-bucket",
			region: "eu-west-1",
			fetch: s3.fetch,
		});
		await storage.read("a/b.json").catch(() => {});
		expect(s3.requests[0]?.url.href).toBe("https://my-bucket.s3.eu-west-1.amazonaws.com/a/b.json");
	});

	it("reports S3 errors with their code", async () => {
		const s3 = fakeS3();
		const storage = s3Storage({
			...credentials,
			bucket: "other",
			endpoint: "http://s3",
			fetch: s3.fetch,
		});
		await expect(storage.list("")).rejects.toThrow(/404 NoSuchBucket/);
	});
});

describe("openTemplateStore", () => {
	it("needs credentials and a bucket for s3:// locations", () => {
		expect(() => openTemplateStore("s3://bucket/prefix", {})).toThrow(/AWS_ACCESS_KEY_ID/);
		expect(() =>
			openTemplateStore("s3:///prefix", { AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "b" }),
		).toThrow(/no bucket/);
		expect(
			openTemplateStore("s3://bucket", { AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "b" }),
		).toHaveProperty("put");
	});
});
