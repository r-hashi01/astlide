/**
 * Templates in S3, or any storage that speaks the S3 API (Cloudflare R2,
 * MinIO, Google Cloud Storage's XML API …). Requests are signed here
 * (Signature Version 4), so no AWS SDK is needed.
 *
 * @module
 */

import { createHash, createHmac } from "node:crypto";
import { createObjectTemplateStore, type ObjectStorage, type TemplateStore } from "./store";

export interface S3StorageOptions {
	bucket: string;
	/** A key prefix, e.g. `astlide/templates/` (a trailing `/` is added when missing). */
	prefix?: string;
	/** Default `us-east-1`. Cloudflare R2 uses `auto`. */
	region?: string;
	/**
	 * The service's URL, for anything but AWS (e.g. `https://<account>.r2.cloudflarestorage.com`,
	 * `http://localhost:9000`). Default: AWS S3 in `region`.
	 */
	endpoint?: string;
	/** Bucket in the path (`endpoint/bucket/key`) instead of the host. Default: true when `endpoint` is set. */
	forcePathStyle?: boolean;
	accessKeyId: string;
	secretAccessKey: string;
	/** For temporary credentials. */
	sessionToken?: string;
	/** Replaces the global `fetch` (tests, proxies). */
	fetch?: typeof fetch;
}

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) =>
	createHmac("sha256", key).update(data).digest();

/** RFC 3986 encoding, as Signature Version 4 wants it (`encodeURIComponent` leaves `!'()*`). */
const encode = (s: string) =>
	encodeURIComponent(s).replace(
		/[!'()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);

/** A key as a URL path: each segment encoded, the slashes kept. */
const encodeKey = (key: string) => key.split("/").map(encode).join("/");

export interface SignInput {
	method: string;
	url: URL;
	/** Headers to sign besides `host`, `x-amz-date` and `x-amz-content-sha256`. */
	headers?: Record<string, string>;
	/** SHA-256 of the body, hex. */
	payloadHash: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
	date?: Date;
}

/**
 * The headers that sign a request for S3 (Signature Version 4): the given
 * ones plus `x-amz-date`, `x-amz-content-sha256`, `authorization` (and
 * `x-amz-security-token` with a session token). `url`'s path must already
 * be encoded.
 *
 * @internal
 */
export function signS3Request(input: SignInput): Record<string, string> {
	const stamp = (input.date ?? new Date()).toISOString().replace(/[-:]|\.\d{3}/g, "");
	const day = stamp.slice(0, 8);
	const headers: Record<string, string> = {};
	for (const [k, v] of Object.entries(input.headers ?? {})) headers[k.toLowerCase()] = v.trim();
	headers.host = input.url.host;
	headers["x-amz-date"] = stamp;
	headers["x-amz-content-sha256"] = input.payloadHash;
	if (input.sessionToken) headers["x-amz-security-token"] = input.sessionToken;
	const names = Object.keys(headers).sort();
	const query = [...input.url.searchParams]
		.map(([k, v]) => [encode(k), encode(v)] as const)
		.sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
		.map(([k, v]) => `${k}=${v}`)
		.join("&");
	const canonical = [
		input.method,
		input.url.pathname,
		query,
		...names.map((n) => `${n}:${headers[n]}`),
		"",
		names.join(";"),
		input.payloadHash,
	].join("\n");
	const scope = `${day}/${input.region}/s3/aws4_request`;
	const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256(canonical)].join("\n");
	let key = hmac(`AWS4${input.secretAccessKey}`, day);
	for (const part of [input.region, "s3", "aws4_request"]) key = hmac(key, part);
	const signature = createHmac("sha256", key).update(toSign).digest("hex");
	const { host: _, ...sent } = headers;
	return {
		...sent,
		authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
	};
}

const XML_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};
const xmlText = (s: string) =>
	s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
		e[0] === "#"
			? String.fromCodePoint(
					e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1)),
				)
			: (XML_ENTITIES[e] ?? m),
	);
const xmlTags = (xml: string, tag: string) =>
	[...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) =>
		xmlText(m[1] ?? ""),
	);

/** An {@link ObjectStorage} in an S3 bucket (or anything with the S3 API). */
export function s3Storage(options: S3StorageOptions): ObjectStorage {
	const region = options.region ?? "us-east-1";
	const pathStyle = options.forcePathStyle ?? !!options.endpoint;
	const endpoint = new URL(options.endpoint ?? `https://s3.${region}.amazonaws.com`);
	const base = pathStyle
		? new URL(`${endpoint.pathname.replace(/\/$/, "")}/${encode(options.bucket)}/`, endpoint)
		: new URL("/", `${endpoint.protocol}//${options.bucket}.${endpoint.host}`);
	const prefix = options.prefix ? `${options.prefix.replace(/^\/+|\/+$/g, "")}/` : "";
	const doFetch = options.fetch ?? fetch;

	async function request(
		method: string,
		key: string | undefined,
		{ body, query }: { body?: Uint8Array; query?: Record<string, string> } = {},
	): Promise<Response> {
		const url = new URL(key === undefined ? "" : encodeKey(prefix + key), base);
		for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
		const headers = signS3Request({
			method,
			url,
			payloadHash: sha256(body ?? ""),
			region,
			accessKeyId: options.accessKeyId,
			secretAccessKey: options.secretAccessKey,
			sessionToken: options.sessionToken,
		});
		// The query exactly as signed.
		const sent = new URL(url);
		sent.search = [...url.searchParams].map(([k, v]) => `${encode(k)}=${encode(v)}`).join("&");
		return doFetch(sent, { method, headers, body: body as BodyInit | undefined });
	}

	async function fail(res: Response, what: string): Promise<never> {
		const text = await res.text().catch(() => "");
		const code = xmlTags(text, "Code")[0];
		const message = xmlTags(text, "Message")[0];
		throw new Error(
			`S3 ${what}: ${res.status}${code ? ` ${code}` : ""}${message ? ` — ${message}` : ""}`,
		);
	}

	return {
		async read(key) {
			const res = await request("GET", key);
			if (res.status === 404) {
				await res.body?.cancel();
				return undefined;
			}
			if (!res.ok) return fail(res, `GET ${prefix}${key}`);
			return new Uint8Array(await res.arrayBuffer());
		},
		async write(key, data) {
			const res = await request("PUT", key, { body: data });
			if (!res.ok) return fail(res, `PUT ${prefix}${key}`);
			await res.body?.cancel();
		},
		async delete(key) {
			const res = await request("DELETE", key);
			if (!res.ok && res.status !== 404) return fail(res, `DELETE ${prefix}${key}`);
			await res.body?.cancel();
		},
		async list(sub) {
			const keys: string[] = [];
			let token: string | undefined;
			do {
				const query: Record<string, string> = { "list-type": "2", prefix: prefix + sub };
				if (token) query["continuation-token"] = token;
				const res = await request("GET", undefined, { query });
				if (!res.ok) return fail(res, `LIST ${prefix}${sub}`);
				const xml = await res.text();
				for (const key of xmlTags(xml, "Key"))
					if (key.startsWith(prefix)) keys.push(key.slice(prefix.length));
				token =
					xmlTags(xml, "IsTruncated")[0] === "true"
						? xmlTags(xml, "NextContinuationToken")[0]
						: undefined;
			} while (token);
			return keys;
		},
	};
}

/** A {@link TemplateStore} in an S3 bucket (or anything with the S3 API). */
export function createS3TemplateStore(options: S3StorageOptions): TemplateStore {
	return createObjectTemplateStore(s3Storage(options));
}
