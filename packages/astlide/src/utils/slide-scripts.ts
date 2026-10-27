/**
 * Scripts in Markdown, HTML and PowerPoint slides — content that may come
 * from someone else (an imported `.pptx`, an HTML slide someone sent) — are
 * removed when the slide is rendered, in `astro dev` and in builds alike:
 * `<script>` elements, inline event handlers (`onclick` …), `javascript:`
 * URLs, `srcdoc` documents and the like. A script in a slide would otherwise
 * run with the site's origin — in `astro dev`, next to the slide editor.
 * MDX slides are code (they run at build time anyway) and keep theirs.
 * `slideScripts: true` (integration option) keeps them everywhere.
 *
 * It happens twice: when the deck loader stores a slide (`loader.ts`), and
 * on the final page — the HTML between a slide's marks (`utils/slide-mark`),
 * in `astro dev` responses and in built pages — which also covers what Astro
 * adds after the loader (image placeholders turned back into attributes).
 *
 * Markup is read with parse5, which parses as browsers do (foreign content,
 * raw-text elements, bogus comments), so what is checked is what a browser
 * would build.
 *
 * @module
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { type DefaultTreeAdapterMap, parseFragment, serialize } from "parse5";
import type { Plugin } from "vite";

type Node = DefaultTreeAdapterMap["childNode"];
type Element = DefaultTreeAdapterMap["element"];
type ParentNode = DefaultTreeAdapterMap["parentNode"];

/** Set by the integration from its `slideScripts` option; read by the deck loader. */
const FLAG = Symbol.for("astlide:slideScripts");

/** Record whether slide scripts are kept (the integration calls this). */
export function setSlideScripts(keep: boolean): void {
	(globalThis as Record<symbol, unknown>)[FLAG] = keep;
}

/** Whether slide scripts are kept (`slideScripts: true`). */
export function slideScriptsKept(): boolean {
	return (globalThis as Record<symbol, unknown>)[FLAG] === true;
}

/**
 * Changes whenever what {@link stripSlideScripts} removes changes, so slides
 * cached by an older version (or with `slideScripts` set differently) are
 * rendered again (see `withoutSlideScripts` in `loader.ts`).
 */
export const SLIDE_SCRIPTS_VERSION = "2";

/** Elements dropped with their content. */
const DROPPED = new Set([
	"script",
	"noscript",
	"object",
	"embed",
	"applet",
	"base",
	"frame",
	"frameset",
	"portal",
]);
/** SVG animation elements, dropped when they animate a link or a handler. */
const ANIMATION = new Set(["animate", "set", "animatemotion", "animatetransform"]);
/** Attributes whose value is a URL (or, for animations, may become one). */
const URL_ATTRIBUTES = new Set([
	"href",
	"xlink:href",
	"src",
	"action",
	"formaction",
	"data",
	"poster",
	"background",
	"values",
	"to",
	"from",
	"by",
]);
/** Elements that load a whole document: no `data:` URL at all (an SVG / HTML document runs script). */
const DOCUMENTS = new Set(["iframe", "frame", "object", "embed"]);

/** Astro's placeholder for a Markdown image, expanded into attributes after the loader. */
const ASTRO_IMAGE = "__ASTRO_IMAGE_";
/** What an image placeholder may carry: image options, never handlers. */
const IMAGE_KEYS = new Set([
	"src",
	"alt",
	"title",
	"index",
	"width",
	"height",
	"class",
	"loading",
	"decoding",
	"fetchpriority",
	"sizes",
	"widths",
	"densities",
	"format",
	"quality",
	"layout",
	"fit",
	"position",
	"priority",
	"inferSize",
]);

/**
 * Whether a URL attribute's value can run script: `javascript:` / `vbscript:`
 * (however spelled), or a `data:` URL other than an image (`data:text/html` …)
 * — any `data:` URL for an element that loads a document.
 */
function scriptUrl(value: string, element: string): boolean {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: browsers ignore these in a scheme
	const compact = value.replace(/[\u0000- ]/g, "").toLowerCase();
	if (compact.startsWith("javascript:") || compact.startsWith("vbscript:")) return true;
	if (!compact.startsWith("data:")) return false;
	return DOCUMENTS.has(element) || !compact.startsWith("data:image/");
}

/** An attribute's full name (`xlink:href`), lower-cased. */
function attributeName(attr: { name: string; prefix?: string }): string {
	return (attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name).toLowerCase();
}

/** Whether an element is dropped with its content. */
function unsafeElement(el: Element): boolean {
	const name = el.tagName.toLowerCase();
	if (DROPPED.has(name)) return true;
	if (name === "meta" && el.attrs.some((a) => attributeName(a) === "http-equiv")) return true;
	if (ANIMATION.has(name)) {
		const target = (
			el.attrs.find((a) => attributeName(a) === "attributename")?.value ?? ""
		).toLowerCase();
		return target.startsWith("on") || target.endsWith("href");
	}
	return false;
}

/**
 * An image placeholder's JSON with only {@link IMAGE_KEYS} (and a URL `src`
 * that can't run script), or null when it can't be read.
 */
function safeImageOptions(json: string): string | null {
	let options: unknown;
	try {
		options = JSON.parse(json);
	} catch {
		return null;
	}
	if (!options || typeof options !== "object" || Array.isArray(options)) return null;
	const kept: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(options)) {
		if (!IMAGE_KEYS.has(key)) continue;
		if (typeof value === "string" && scriptUrl(value, "img")) continue;
		if (value !== null && typeof value === "object") continue;
		kept[key] = value;
	}
	return JSON.stringify(kept);
}

/** Remove scripts below `parent`; whether anything was removed. */
function clean(parent: ParentNode): boolean {
	let changed = false;
	const nodes = parent.childNodes as Node[];
	for (let i = nodes.length - 1; i >= 0; i--) {
		const node = nodes[i];
		if (!node || !("tagName" in node)) continue;
		const el = node as Element;
		if (unsafeElement(el)) {
			nodes.splice(i, 1);
			changed = true;
			continue;
		}
		const name = el.tagName.toLowerCase();
		const attrs = [];
		for (const attr of el.attrs) {
			const full = attributeName(attr);
			if (full === ASTRO_IMAGE.toLowerCase()) {
				const safe = safeImageOptions(attr.value);
				if (safe === null) {
					changed = true;
					continue;
				}
				// parse5 lower-cases names; Astro looks for this spelling (restored if re-serialized).
				if (safe !== attr.value) changed = true;
				attrs.push({ ...attr, name: ASTRO_IMAGE, value: safe });
				continue;
			}
			if (
				full.startsWith("on") ||
				full === "srcdoc" ||
				(URL_ATTRIBUTES.has(full) && scriptUrl(attr.value, name))
			) {
				changed = true;
				continue;
			}
			attrs.push(attr);
		}
		el.attrs = attrs;
		if (clean(el)) changed = true;
		if (name === "template" && "content" in el && clean(el.content as ParentNode)) changed = true;
	}
	return changed;
}

/**
 * `html` without scripts (see the module). Returned unchanged — byte for
 * byte — when there is nothing to remove; otherwise re-serialized, and the
 * result checked again until nothing changes (what a browser builds from
 * serialized markup can differ from the tree it came from). `normalize`
 * re-serializes even when nothing is removed, so unclosed markup is closed
 * where the content ends (the page pass: content can't swallow what follows).
 */
export function stripSlideScripts(html: string, normalize = false): string {
	let current = html;
	for (let round = 0; round < 4; round++) {
		const fragment = parseFragment(current, { scriptingEnabled: true });
		if (!clean(fragment) && !(normalize && round === 0)) return current;
		current = serialize(fragment);
	}
	// Still changing: give up on the markup rather than serve something unsure.
	return "";
}

/**
 * A page with scripts removed from every slide's content — the HTML between
 * the slide marks for `mark` (see `utils/slide-mark`). Slide content is
 * re-serialized (normalized) even when nothing is removed, so markup a slide
 * leaves open can't swallow the page after it; a page without marks is
 * returned unchanged.
 */
export function stripSlideContent(page: string, mark: string): string {
	if (!mark) return page;
	const start = `<!--astlide-slide:${mark}-->`;
	const end = `<!--/astlide-slide:${mark}-->`;
	let out = "";
	let at = 0;
	for (;;) {
		const open = page.indexOf(start, at);
		if (open < 0) break;
		const from = open + start.length;
		const close = page.indexOf(end, from);
		// No end mark: the rest of the page is treated as slide content.
		const to = close < 0 ? page.length : close;
		out += page.slice(at, from) + stripSlideScripts(page.slice(from, to), true);
		at = to;
		if (close < 0) break;
	}
	return at === 0 ? page : out + page.slice(at);
}

/** Strip slide scripts from every built page under `dir` (see {@link stripSlideContent}); how many pages were rewritten. */
export async function stripBuiltPages(dir: string, mark: string): Promise<number> {
	let changed = 0;
	for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
		const file = join(entry.parentPath, entry.name);
		const page = await readFile(file, "utf8");
		const clean = stripSlideContent(page, mark);
		if (clean !== page) {
			await writeFile(file, clean);
			changed++;
		}
	}
	return changed;
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
