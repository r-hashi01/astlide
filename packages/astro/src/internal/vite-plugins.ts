/**
 * The Vite plugins of the Astro integration that rewrite slide sources and
 * pages: the trailing notes comment of `.mdx` slides, and slide scripts in
 * dev responses.
 *
 * @module
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { stripTrailingComment } from "@astlide/core/utils/comment-notes";
import { stripSlideContent } from "@astlide/core/utils/slide-scripts";
import type { Plugin } from "vite";

/**
 * Vite plugin: drop the trailing HTML comment (speaker notes) from `.mdx`
 * sources before `@astrojs/mdx` compiles them — MDX would reject it. The notes
 * themselves are read from the entry's raw body by the slide page.
 */
export function astlideCommentNotesPlugin(): Plugin {
	return {
		name: "astlide:comment-notes",
		enforce: "pre",
		transform(code, id) {
			if (!/\.mdx(?:$|\?)/.test(id)) return null;
			const stripped = stripTrailingComment(code);
			return stripped === null ? null : { code: stripped, map: null };
		},
	};
}

/**
 * Dev only (`apply: "serve"`): HTML responses go through
 * {@link stripSlideContent} before they reach the browser — the same pass
 * built pages get.
 */
export function astlideSlideScriptsPlugin(mark: string): Plugin {
	return {
		name: "astlide:slide-scripts",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use((_req: IncomingMessage, res: ServerResponse, next: () => void) => {
				const chunks: Buffer[] = [];
				let html: boolean | undefined;
				const isHtml = () => {
					html ??= /text\/html/i.test(String(res.getHeader("content-type") ?? ""));
					return html;
				};
				const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => ServerResponse;
				const write = res.write.bind(res) as (...args: unknown[]) => boolean;
				const end = res.end.bind(res) as (...args: unknown[]) => ServerResponse;
				const toBuffer = (chunk: unknown, encoding: unknown) =>
					typeof chunk === "string"
						? Buffer.from(
								chunk,
								typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8",
							)
						: Buffer.from(chunk as Uint8Array);
				res.writeHead = ((status: number, ...args: unknown[]) => {
					const headers = args.find((a) => a && typeof a === "object" && !Array.isArray(a)) as
						| Record<string, unknown>
						| undefined;
					for (const [name, value] of Object.entries(headers ?? {})) {
						if (name.toLowerCase() === "content-type") html = /text\/html/i.test(String(value));
					}
					// The body may change length.
					if (isHtml() && headers)
						for (const name of Object.keys(headers))
							if (name.toLowerCase() === "content-length") delete headers[name];
					if (isHtml()) res.removeHeader("content-length");
					return writeHead(status, ...args);
				}) as typeof res.writeHead;
				res.write = ((chunk: unknown, encoding?: unknown, callback?: unknown) => {
					if (!isHtml()) return write(chunk, encoding, callback);
					chunks.push(toBuffer(chunk, encoding));
					const done = typeof encoding === "function" ? encoding : callback;
					if (typeof done === "function") done();
					return true;
				}) as typeof res.write;
				res.end = ((chunk?: unknown, encoding?: unknown, callback?: unknown) => {
					if (!isHtml()) return end(chunk, encoding, callback);
					if (chunk !== undefined && chunk !== null && typeof chunk !== "function")
						chunks.push(toBuffer(chunk, encoding));
					const done = [chunk, encoding, callback].find((a) => typeof a === "function");
					const body = stripSlideContent(Buffer.concat(chunks).toString("utf8"), mark);
					if (!res.headersSent) res.removeHeader("content-length");
					return end(body, "utf8", done);
				}) as typeof res.end;
				next();
			});
		},
	};
}
