/**
 * The HTTP API as a fetch handler (`Request` → `Response`):
 *
 * - `POST /render` — Markdown slides (+ theme or uploaded template) → PPTX / PDF / PNG (zip)
 * - `POST /import` — PPTX (or Google Slides URL) → slides as HTML
 * - `POST /templates/layouts` — a template's layouts and placeholders
 * - `GET|POST /templates`, `GET|DELETE /templates/{name}`, `GET /templates/{name}/file`
 *   — stored templates, when `ASTLIDE_TEMPLATE_STORE` is set
 * - `GET /openapi.json`, `GET /health`
 *
 * Each render's project is deleted when its response is ready. Only templates
 * uploaded to `/templates` are kept, and only with `ASTLIDE_TEMPLATE_STORE` set.
 *
 * @module
 */

import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { THEMES } from "@astlide/core/schema";
import {
	type TemplateExtension,
	type TemplateInfo,
	templateNameError,
} from "@astlide/core/templates";
import { type ServerOptions, trimTrailingSlashes } from "./config";
import { BadRequest, type DeckSettings, deckFiles, parseSlides } from "./deck";
import { fetchGoogleSlides, isZip, parsePptx, TEMPLATE_EXTS } from "./importer";
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

/** Longest URL path accepted (414 beyond). */
const MAX_PATH = 2048;

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

/** A version number from a query or a field, or undefined when not given. */
function versionParam(value: unknown, key: string): number | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isInteger(n) || n < 1)
		throw new BadRequest(`"${key}" must be a version number (1, 2, …)`);
	return n;
}

/** A template as listed: its versions without their metadata. */
const templateSummary = (info: TemplateInfo) => ({
	name: info.name,
	label: info.label ?? null,
	latest: info.latest,
	updatedAt: info.updatedAt,
	versions: info.versions.map(({ meta: _, ...v }) => v),
});

const CONTENT_TYPES: Record<string, string> = {
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".potx": "application/vnd.openxmlformats-officedocument.presentationml.template",
	".thmx": "application/vnd.ms-officetheme",
};

/** `/templates/{name}` and `/templates/{name}/file`. */
const TEMPLATE_PATH = /^\/templates\/([^/]+)(\/file)?$/;

/** Create the fetch handler. */
export function createHandler(options: ServerOptions) {
	const queue = new Queue(options.concurrency, options.maxQueued);
	const store = options.templates;
	const storeOff = () =>
		new HttpError(404, "template storage is off: start the server with ASTLIDE_TEMPLATE_STORE set");

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
		const stored = optionalString(fields, "template");
		let template: { ext: string; data: Uint8Array } | undefined;
		if (stored !== undefined) {
			if (!store) throw storeOff();
			const version = versionParam(fields.templateVersion, "templateVersion");
			const found = await store.get(stored, version);
			if (!found)
				throw new HttpError(
					404,
					`no template "${stored}"${version ? ` with version ${version}` : ""}`,
				);
			template = { ext: found.version.ext, data: found.data };
			settings.theme = TEMPLATE_THEME;
		} else if (upload) {
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

	/** `POST /templates`: store a template (a new version when the name exists). */
	async function addTemplate(req: Request): Promise<Response> {
		if (!store) throw storeOff();
		const { fields, files } = await parseInput(req, options.maxBodyBytes);
		const name = optionalString(fields, "name");
		if (!name) throw new BadRequest('send the template\'s "name"');
		const nameError = name === "layouts" ? '"layouts" is reserved' : templateNameError(name);
		if (nameError) throw new BadRequest(nameError);
		const file = files.file ?? files.template;
		if (!file) throw new BadRequest('send the template as "file"');
		const ext = extname(file.name).toLowerCase() || ".pptx";
		if (!TEMPLATE_EXTS.includes(ext))
			throw new BadRequest(`"file" must be a ${TEMPLATE_EXTS.join(" / ")} file`);
		if (!isZip(file.data)) throw new BadRequest(`not a ${TEMPLATE_EXTS.join(" / ")} file`);
		// Read it once now: a file that isn't a template is refused, and its layouts are kept.
		const outline = await queue.run(() => parsePptx("layouts", file.data, parseOptions));
		const info = await store.put(name, file.data, {
			ext: ext as TemplateExtension,
			label: optionalString(fields, "label"),
			meta: { outline },
		});
		return json(templateSummary(info), info.latest === 1 && info.versions.length === 1 ? 201 : 200);
	}

	async function listTemplates(): Promise<Response> {
		if (!store) throw storeOff();
		return json({ templates: (await store.list()).map(templateSummary) });
	}

	/** `GET|DELETE /templates/{name}` and `GET /templates/{name}/file`. */
	async function templateRoute(req: Request, name: string, file: boolean): Promise<Response> {
		if (!store) throw storeOff();
		const url = new URL(req.url);
		const version = versionParam(url.searchParams.get("version"), "version");
		const missing = () =>
			new HttpError(404, `no template "${name}"${version ? ` with version ${version}` : ""}`);
		const method = req.method === "HEAD" ? "GET" : req.method;
		if (file) {
			if (method !== "GET") throw new HttpError(405, "use GET");
			const found = await store.get(name, version);
			if (!found) throw missing();
			return new Response(new Uint8Array(found.data), {
				headers: {
					"content-type": CONTENT_TYPES[found.version.ext] ?? "application/octet-stream",
					"content-disposition": `attachment; filename="${name}-v${found.version.version}${found.version.ext}"`,
				},
			});
		}
		if (method === "DELETE") {
			if (!(await store.remove(name, version))) throw missing();
			return new Response(null, { status: 204 });
		}
		if (method !== "GET") throw new HttpError(405, "use GET / DELETE");
		const info = await store.info(name);
		const chosen = info?.versions.find((v) => v.version === (version ?? info.latest));
		if (!info || !chosen) throw missing();
		// Added elsewhere (the CLI, your own code): read the layouts from the file, in the worker.
		let outline = chosen.meta?.outline;
		if (outline === undefined) {
			const stored = await store.get(name, chosen.version);
			if (!stored) throw missing();
			outline = await queue.run(() => parsePptx("layouts", stored.data, parseOptions));
		}
		return json({ ...templateSummary(info), version: chosen.version, outline });
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
		"/templates": { GET: listTemplates, POST: addTemplate },
	};
	const open = new Set(["/health", "/openapi.json"]);

	const key = options.apiKey ? Buffer.from(options.apiKey) : undefined;

	function authorized(req: Request): boolean {
		if (!key) return true;
		const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
		const sent = bearer ?? req.headers.get("x-api-key");
		if (sent == null) return false;
		const got = Buffer.from(sent);
		// Constant time over the key's bytes (only a wrong length is told apart, and keys are random).
		if (got.length !== key.length) return !timingSafeEqual(key, key);
		return timingSafeEqual(got, key);
	}

	/** Requests reading a body or holding a parsed upload; beyond the queue's room they get 503. */
	let busy = 0;
	const heavy = new Set(["/render", "/import", "/templates/layouts", "/templates"]);

	return async function handle(req: Request): Promise<Response> {
		const { pathname } = new URL(req.url);
		if (pathname.length > MAX_PATH) return json({ error: "URL too long" }, 414);
		// A loop, not /\/+$/: that regex backtracks on long runs of slashes.
		const path = trimTrailingSlashes(pathname) || "/";
		try {
			if (path === "/") return json({ name: "astlide-server", openapi: "/openapi.json" });
			// Before anything else: without the key, not even which routes exist.
			if (!open.has(path) && !authorized(req)) throw new HttpError(401, "missing or wrong API key");
			const stored = routes[path] ? undefined : path.match(TEMPLATE_PATH);
			if (stored) return await templateRoute(req, stored[1] as string, !!stored[2]);
			const route = routes[path];
			if (!route) throw new HttpError(404, "not found");
			const method = req.method === "HEAD" ? "GET" : req.method;
			const fn = route[method];
			if (!fn) throw new HttpError(405, `use ${Object.keys(route).join(" / ")}`);
			if (!heavy.has(path) || method !== "POST") return await fn(req);
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
