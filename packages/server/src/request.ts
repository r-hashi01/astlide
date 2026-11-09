/**
 * Reading requests and writing JSON responses: bodies of bounded size and
 * time, fields and files from JSON or multipart/form-data, and the checks
 * on the fields the routes share.
 *
 * @module
 */

import { BadRequest } from "./deck";

/** An error answered with its status and message. */
export class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

/** A JSON response. */
export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", ...headers },
	});

/** How long a client may take to send a request body. */
export const BODY_TIMEOUT_MS = 60_000;

/**
 * The request body, refused (413) beyond `max` bytes and (408) when it takes
 * longer than `timeoutMs` to arrive — enforced here, whatever the runtime's
 * own request timeouts do, so a slow client can't hold a slot.
 */
export async function readBody(
	req: Request,
	max: number,
	timeoutMs = BODY_TIMEOUT_MS,
): Promise<Uint8Array> {
	const declared = Number(req.headers.get("content-length") ?? "0");
	if (declared > max) throw new HttpError(413, `request body over ${max} bytes`);
	if (!req.body) return new Uint8Array();
	const chunks: Uint8Array[] = [];
	let size = 0;
	const reader = req.body.getReader();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new HttpError(408, "request body took too long")), timeoutMs);
	});
	try {
		for (;;) {
			const { done, value } = await Promise.race([reader.read(), deadline]);
			if (done) break;
			size += value.length;
			if (size > max) throw new HttpError(413, `request body over ${max} bytes`);
			chunks.push(value);
		}
	} catch (e) {
		await reader.cancel().catch(() => {});
		throw e;
	} finally {
		clearTimeout(timer);
	}
	return Buffer.concat(chunks);
}

/** A file sent in a JSON body: base64 bytes and a file name. */
interface JsonFile {
	filename?: string;
	data: string;
}

/** A request's fields and files, from JSON or multipart/form-data. */
export interface Input {
	fields: Record<string, unknown>;
	files: Record<string, { name: string; data: Uint8Array }>;
}

/** A request's fields and files (JSON with base64 files, or multipart/form-data). */
export async function parseInput(req: Request, max: number): Promise<Input> {
	const type = req.headers.get("content-type") ?? "";
	const body = await readBody(req, max);
	if (type.includes("multipart/form-data")) {
		let form: FormData;
		try {
			form = await new Response(body as BodyInit, { headers: { "content-type": type } }).formData();
		} catch {
			throw new BadRequest("malformed multipart/form-data body");
		}
		const input: Input = { fields: {}, files: {} };
		for (const [key, value] of form.entries()) {
			if (typeof value === "string") input.fields[key] = value;
			else
				input.files[key] = {
					name: value.name,
					data: new Uint8Array(await value.arrayBuffer()),
				};
		}
		return input;
	}
	if (type.includes("application/json") || type === "") {
		let fields: unknown;
		try {
			fields = JSON.parse(Buffer.from(body).toString("utf-8") || "{}");
		} catch {
			throw new BadRequest("malformed JSON body");
		}
		if (!fields || typeof fields !== "object" || Array.isArray(fields))
			throw new BadRequest("the JSON body must be an object");
		const input: Input = { fields: fields as Record<string, unknown>, files: {} };
		// Files as { filename, data: base64 } objects.
		for (const [key, value] of Object.entries(input.fields)) {
			const file = value as JsonFile;
			if (file && typeof file === "object" && typeof file.data === "string") {
				input.files[key] = {
					name: typeof file.filename === "string" ? file.filename : key,
					data: new Uint8Array(Buffer.from(file.data, "base64")),
				};
				delete input.fields[key];
			}
		}
		return input;
	}
	throw new HttpError(415, "send application/json or multipart/form-data");
}

/** A string field, or undefined when not given. */
export const optionalString = (
	fields: Record<string, unknown>,
	key: string,
): string | undefined => {
	const value = fields[key];
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value !== "string") throw new BadRequest(`"${key}" must be a string`);
	return value;
};

/** A multipart `slides` field may be a JSON array. */
export function slidesField(value: unknown): unknown {
	if (typeof value === "string" && value.trimStart().startsWith("[")) {
		try {
			return JSON.parse(value);
		} catch {
			throw new BadRequest('"slides" is not valid JSON');
		}
	}
	return value;
}

/** File name for the download: the deck title as a slug, else "slides". */
export function downloadName(title: string | undefined, ext: string): string {
	const base =
		(title ?? "")
			.slice(0, 200)
			.normalize("NFKD")
			.replace(/[^\w.-]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "slides";
	return `${base}.${ext}`;
}

/** A version number from a query or a field, or undefined when not given. */
export function versionParam(value: unknown, key: string): number | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isInteger(n) || n < 1)
		throw new BadRequest(`"${key}" must be a version number (1, 2, …)`);
	return n;
}
