/**
 * Dev-only endpoint behind the in-browser slide editor (`e` in `astro dev`).
 *
 *   GET  /__astlide/source?path=src/content/decks/talk/01-cover.mdx → { path, content }
 *   POST /__astlide/source  { path, content }                        → { ok: true }
 *
 * Writing the file lets Astro's dev server pick up the change and reload the
 * slide. Only slide sources can be read or written: the path must resolve
 * inside the project's `src/` and end in `.mdx`, `.md` or `.html`, and POSTs
 * must come from the dev server's own origin. Registered with `apply: "serve"`,
 * so it never exists in a production build.
 */

import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";

export const EDITOR_ENDPOINT = "/__astlide/source";
const SLIDE_SOURCE = /\.(mdx|md|html)$/i;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Resolve a slide path from the client to an absolute file path, or `null` if
 * it isn't an editable slide source inside `<root>/src/`.
 */
export function resolveSlideSource(root: string, path: unknown): string | null {
	if (typeof path !== "string" || path.length === 0 || path.includes("\0")) return null;
	if (!SLIDE_SOURCE.test(path)) return null;
	const srcDir = resolve(root, "src");
	const absolute = resolve(root, path);
	const rel = relative(srcDir, absolute);
	if (
		rel === "" ||
		rel.startsWith("..") ||
		rel.startsWith(sep) ||
		resolve(srcDir, rel) !== absolute
	) {
		return null;
	}
	return absolute;
}

/** A POST must come from the page the dev server served (blocks cross-site writes). */
export function isSameOrigin(req: Pick<IncomingMessage, "headers">): boolean {
	const origin = req.headers.origin;
	const host = req.headers.host;
	if (!origin || !host) return false;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}

function send(res: ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
	let size = 0;
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		size += chunk.length;
		if (size > MAX_BODY_BYTES) throw new Error("Body too large");
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString("utf-8");
}

export function astlideEditorPlugin(root: string): Plugin {
	return {
		name: "astlide:editor",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use(EDITOR_ENDPOINT, async (req, res) => {
				try {
					if (req.method === "GET") {
						const url = new URL(req.url ?? "", "http://localhost");
						const file = resolveSlideSource(root, url.searchParams.get("path"));
						if (!file) return send(res, 400, { error: "Not an editable slide source" });
						const content = await readFile(file, "utf-8");
						return send(res, 200, { path: url.searchParams.get("path"), content });
					}
					if (req.method === "POST") {
						if (!isSameOrigin(req)) return send(res, 403, { error: "Cross-origin write refused" });
						const body = JSON.parse(await readBody(req)) as { path?: unknown; content?: unknown };
						const file = resolveSlideSource(root, body.path);
						if (!file || typeof body.content !== "string") {
							return send(res, 400, { error: "Not an editable slide source" });
						}
						await writeFile(file, body.content, "utf-8");
						return send(res, 200, { ok: true });
					}
					res.setHeader("Allow", "GET, POST");
					return send(res, 405, { error: "Method not allowed" });
				} catch (error) {
					return send(res, 500, { error: (error as Error).message });
				}
			});
		},
	};
}
