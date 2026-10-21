/**
 * The HTTP API as a fetch handler (`Request` → `Response`):
 *
 * - `POST /render` — Markdown slides (+ theme or uploaded template) → PPTX / PDF / PNG (zip)
 * - `POST /import` — PPTX (or Google Slides URL) → slides as HTML
 * - `POST /templates/layouts` — a template's layouts and placeholders
 * - `GET /openapi.json`, `GET /health`
 *
 * Nothing is kept: each render's project is deleted when its response is ready.
 *
 * @module
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { THEMES } from "@astlide/core/schema";
import type { ServerOptions } from "./config";
import { BadRequest, type DeckSettings, deckFiles, parseSlides } from "./deck";
import { fetchGoogleSlides, parsePptx, TEMPLATE_EXTS } from "./importer";
import { createProject, removeProject, TEMPLATE_THEME } from "./project";
import { Queue, QueueFull } from "./queue";
import { FORMATS, type Format, renderProject } from "./render";

const readJson = (path: string) =>
	JSON.parse(readFileSync(new URL(path, import.meta.url), "utf-8")) as Record<string, unknown>;
const VERSION = (readJson("../package.json") as { version: string }).version;
const SPEC = readJson("../openapi.json") as { info: Record<string, unknown> };

class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", ...headers },
	});

/** The request body, refused (413) beyond `max` bytes. */
async function readBody(req: Request, max: number): Promise<Uint8Array> {
	const declared = Number(req.headers.get("content-length") ?? "0");
	if (declared > max) throw new HttpError(413, `request body over ${max} bytes`);
	if (!req.body) return new Uint8Array();
	const chunks: Uint8Array[] = [];
	let size = 0;
	const reader = req.body.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.length;
		if (size > max) {
			await reader.cancel();
			throw new HttpError(413, `request body over ${max} bytes`);
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks);
}

/** A file sent in a JSON body: base64 bytes and a file name. */
interface JsonFile {
	filename?: string;
	data: string;
}

/** A request's fields and files, from JSON or multipart/form-data. */
interface Input {
	fields: Record<string, unknown>;
	files: Record<string, { name: string; data: Uint8Array }>;
}

async function parseInput(req: Request, max: number): Promise<Input> {
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

const optionalString = (fields: Record<string, unknown>, key: string): string | undefined => {
	const value = fields[key];
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value !== "string") throw new BadRequest(`"${key}" must be a string`);
	return value;
};

/** A multipart `slides` field may be a JSON array. */
function slidesField(value: unknown): unknown {
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
function downloadName(title: string | undefined, ext: string): string {
	const base =
		(title ?? "")
			.slice(0, 200)
			.normalize("NFKD")
			.replace(/[^\w.-]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "slides";
	return `${base}.${ext}`;
}

/** Create the fetch handler. */
export function createHandler(options: ServerOptions) {
	const queue = new Queue(options.concurrency, options.maxQueued);

	async function render(req: Request): Promise<Response> {
		// Refuse before reading the body: a full queue shouldn't buffer more uploads.
		if (queue.full) throw new QueueFull();
		const { fields, files } = await parseInput(req, options.maxBodyBytes);
		const format = (optionalString(fields, "format") ?? "pptx") as Format;
		if (!FORMATS.includes(format))
			throw new BadRequest(`"format" must be one of ${FORMATS.join(", ")}`);
		const output = optionalString(fields, "output") ?? "file";
		if (output !== "file" && output !== "base64")
			throw new BadRequest('"output" must be "file" or "base64"');

		const slides = await parseSlides(
			{ markdown: fields.markdown, slides: slidesField(fields.slides) },
			options.maxSlides,
		);

		const settings: DeckSettings = {
			title: optionalString(fields, "title"),
			author: optionalString(fields, "author"),
			date: optionalString(fields, "date"),
		};
		const upload = files.template;
		let template: { ext: string; data: Uint8Array } | undefined;
		if (upload) {
			const ext = extname(upload.name).toLowerCase() || ".pptx";
			if (!TEMPLATE_EXTS.includes(ext))
				throw new BadRequest(`"template" must be a ${TEMPLATE_EXTS.join(" / ")} file`);
			template = { ext, data: upload.data };
			settings.theme = TEMPLATE_THEME;
		} else {
			const theme = optionalString(fields, "theme");
			if (theme && !(THEMES as readonly string[]).includes(theme))
				throw new BadRequest(`"theme" must be one of ${THEMES.join(", ")} (or upload a template)`);
			settings.theme = theme;
		}
		const deck = { files: deckFiles(slides, settings), template };

		const started = Date.now();
		const rendered = await queue.run(async () => {
			const root = await createProject(deck, options);
			try {
				return await renderProject(root, format, {
					cli: options.cli,
					bun: options.bun,
					timeoutMs: options.renderTimeoutMs,
					allowPrivateNetwork: options.allowPrivateNetwork,
					maxSlides: options.maxSlides,
					maxOutputBytes: options.maxOutputBytes,
					chromiumSandbox: options.chromiumSandbox,
				});
			} finally {
				await removeProject(root);
			}
		});
		const filename = downloadName(settings.title, rendered.ext);
		const timing = { "x-render-time-ms": String(Date.now() - started) };
		if (output === "base64")
			return json(
				{
					filename,
					contentType: rendered.contentType,
					size: rendered.data.length,
					data: rendered.data.toString("base64"),
				},
				200,
				timing,
			);
		return new Response(new Uint8Array(rendered.data), {
			headers: {
				"content-type": rendered.contentType,
				"content-disposition": `attachment; filename="${filename}"`,
				...timing,
			},
		});
	}

	/** Uploaded PowerPoint files are read in a child process, through the render queue. */
	const parseOptions = {
		bun: options.bun,
		timeoutMs: options.renderTimeoutMs,
		maxOutputBytes: options.maxOutputBytes,
	};

	async function importRoute(req: Request): Promise<Response> {
		const { fields, files } = await parseInput(req, options.maxBodyBytes);
		const url = optionalString(fields, "url");
		const data =
			files.file?.data ?? (url ? await fetchGoogleSlides(url, options.maxBodyBytes) : undefined);
		if (!data) throw new BadRequest('send a .pptx as "file", or a Google Slides "url"');
		return json(await queue.run(() => parsePptx("deck", data, parseOptions)));
	}

	async function layoutsRoute(req: Request): Promise<Response> {
		const { files } = await parseInput(req, options.maxBodyBytes);
		const file = files.file ?? files.template;
		if (!file) throw new BadRequest('send the template as "file"');
		return json(await queue.run(() => parsePptx("layouts", file.data, parseOptions)));
	}

	function openapi(req: Request): Response {
		const origin = options.publicUrl ?? new URL(req.url).origin;
		return json({ ...SPEC, info: { ...SPEC.info, version: VERSION }, servers: [{ url: origin }] });
	}

	const routes: Record<string, Record<string, (req: Request) => Promise<Response> | Response>> = {
		"/health": {
			GET: () => json({ status: "ok", version: VERSION, queue: queue.size }),
		},
		"/openapi.json": { GET: openapi },
		"/render": { POST: render },
		"/import": { POST: importRoute },
		"/templates/layouts": { POST: layoutsRoute },
	};
	const open = new Set(["/health", "/openapi.json"]);

	const digest = (s: string) => createHash("sha256").update(s).digest();
	const keyDigest = options.apiKey ? digest(options.apiKey) : undefined;

	function authorized(req: Request): boolean {
		if (!keyDigest) return true;
		const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
		const sent = bearer ?? req.headers.get("x-api-key");
		// Compared as digests, in constant time: the key's length and bytes don't leak.
		return sent != null && timingSafeEqual(digest(sent), keyDigest);
	}

	/** Requests reading a body or holding a parsed upload; beyond the queue's room they get 503. */
	let busy = 0;
	const heavy = new Set(["/render", "/import", "/templates/layouts"]);

	return async function handle(req: Request): Promise<Response> {
		const { pathname } = new URL(req.url);
		const path = pathname.replace(/\/+$/, "") || "/";
		try {
			if (path === "/") return json({ name: "astlide-server", openapi: "/openapi.json" });
			// Before anything else: without the key, not even which routes exist.
			if (!open.has(path) && !authorized(req)) throw new HttpError(401, "missing or wrong API key");
			const route = routes[path];
			if (!route) throw new HttpError(404, "not found");
			const method = req.method === "HEAD" ? "GET" : req.method;
			const fn = route[method];
			if (!fn) throw new HttpError(405, `use ${Object.keys(route).join(" / ")}`);
			if (!heavy.has(path)) return await fn(req);
			if (busy >= options.concurrency + options.maxQueued) throw new QueueFull();
			busy++;
			try {
				return await fn(req);
			} finally {
				busy--;
			}
		} catch (e) {
			const status = (e as { status?: number }).status;
			if (typeof status === "number" && status >= 400 && status < 600)
				return json({ error: (e as Error).message }, status);
			console.error(e);
			return json({ error: "internal error" }, 500);
		}
	};
}
