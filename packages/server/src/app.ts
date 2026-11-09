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

import { readFileSync } from "node:fs";
import { apiKeyCheck } from "./auth";
import { type ServerOptions, trimTrailingSlashes } from "./config";
import { Queue, QueueFull } from "./queue";
import { HttpError, json } from "./request";
import { routeContext } from "./routes/context";
import { importRoutes } from "./routes/pptx";
import { renderRoute } from "./routes/render";
import { TEMPLATE_PATH, templateRoutes } from "./routes/templates";

export { BODY_TIMEOUT_MS, readBody } from "./request";

const readJson = (path: string) =>
	JSON.parse(readFileSync(new URL(path, import.meta.url), "utf-8")) as Record<string, unknown>;
const VERSION = (readJson("../package.json") as { version: string }).version;
const SPEC = readJson("../openapi.json") as { info: Record<string, unknown> };

/** Longest URL path accepted (414 beyond). */
const MAX_PATH = 2048;

/** Create the fetch handler. */
export function createHandler(options: ServerOptions) {
	const queue = new Queue(options.concurrency, options.maxQueued);
	const context = routeContext(options, queue);
	const render = renderRoute(context);
	const { importRoute, layoutsRoute } = importRoutes(context);
	const { addTemplate, listTemplates, templateRoute } = templateRoutes(context);

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

	const authorized = apiKeyCheck(options.apiKey);

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
