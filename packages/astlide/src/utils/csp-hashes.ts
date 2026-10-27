/**
 * Built pages without `script-src 'unsafe-inline'`: after `astro build`, the
 * inline `<script>`s Astlide and Astro put on a page are hashed (SHA-256), and
 * the hashes replace `'unsafe-inline'` in the CSP. Inline scripts inside the
 * slides themselves are not hashed — so they don't run — unless the
 * `slideScripts` option says the decks' content is trusted: slide content can
 * come from others (an imported `.pptx`, someone's HTML slide), and a script
 * that slips through there must not be allowed by the build.
 *
 * Slide content is what lies between the `utils/slide-mark` comments, which
 * carry a random value made for each build — content written before the build
 * can't fake the end of the slide. Astro's own island scripts (the hydration
 * runtime and `client:*` directives, which it may place inside a slide) are
 * recognised by their exact text.
 *
 * Every page gets the hashes of all pages in the build: moving between slides
 * swaps pages in place (Astro's ClientRouter), keeping the first page's
 * policy, so it must allow the scripts of the pages it moves to. Only
 * policies Astlide emitted by default are rewritten (their `<meta>` carries
 * {@link CSP_HASH_MARKER}); a `csp` string you set is used as is.
 *
 * Limits, by design:
 * - The allowlist is shared, and `'self'` stays allowed: slide content can't
 *   bring a script of its own, but it can re-run one that's already allowed
 *   (the same text as an allowed inline script, a bundled `/_astro` chunk,
 *   an Astro island with props it chooses). It narrows what injected markup
 *   can do; it doesn't make it harmless.
 * - Each page's `define:vars` script differs, so every page carries roughly
 *   one hash per page in the build.
 * - Pages are parsed with htmlparser2, not a browser's parser. Where the two
 *   disagree (comments like `<!-->`, raw-text elements), content can at most
 *   hide the end of a slide mark — later scripts then count as slide content
 *   and are blocked. It fails towards blocking, never towards allowing.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import idle from "astro/runtime/client/idle.prebuilt.js";
import load from "astro/runtime/client/load.prebuilt.js";
import media from "astro/runtime/client/media.prebuilt.js";
import only from "astro/runtime/client/only.prebuilt.js";
import visible from "astro/runtime/client/visible.prebuilt.js";
import island from "astro/runtime/server/astro-island.prebuilt.js";
import { Parser } from "htmlparser2";
import { slideContentMarks } from "./slide-mark";

/** Attribute on a CSP `<meta>` whose `script-src` gets the page's script hashes. */
export const CSP_HASH_MARKER = "data-astlide-csp";

/** Inline scripts Astro itself may write inside a slide (islands), by exact text. */
const ASTRO_RUNTIME = new Set<string>([island, idle, load, media, only, visible]);

const sha256 = (text: string) =>
	`'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

export interface InlineScript {
	/** `'sha256-…'` of its text. */
	hash: string;
	/** Whether it is in a slide's content (and isn't one of Astro's island scripts). */
	inSlide: boolean;
}

/**
 * The inline `<script>`s of a page (external ones left out), each with its
 * hash and whether it belongs to a slide's content. `mark` is the build's
 * slide mark; without it, no script counts as slide content.
 */
export function inlineScripts(html: string, mark?: string): InlineScript[] {
	const marks = mark ? slideContentMarks(mark) : undefined;
	const scripts: InlineScript[] = [];
	let depth = 0;
	let open: { end: number; external: boolean } | undefined;
	const parser = new Parser(
		{
			oncomment(data) {
				if (!marks) return;
				if (data === marks.start) depth++;
				else if (data === marks.end && depth > 0) depth--;
			},
			onopentag(name, attribs) {
				if (name === "script") open = { end: parser.endIndex, external: "src" in attribs };
			},
			onclosetag(name) {
				if (name !== "script" || !open) return;
				// The exact characters between the tags: what the browser hashes.
				const body = html.slice(open.end + 1, parser.startIndex);
				if (!open.external)
					scripts.push({ hash: sha256(body), inSlide: depth > 0 && !ASTRO_RUNTIME.has(body) });
				open = undefined;
			},
		},
		{ lowerCaseTags: true, lowerCaseAttributeNames: true },
	);
	parser.end(html);
	return scripts;
}

/** `policy` with `'unsafe-inline'` in `script-src` replaced by `hashes`. */
export function withScriptHashes(policy: string, hashes: string[]): string {
	return policy
		.split(";")
		.map((directive) => {
			const parts = directive.trim().split(/\s+/);
			if (parts[0]?.toLowerCase() !== "script-src") return directive.trim();
			const sources = parts.slice(1).filter((s) => s.toLowerCase() !== "'unsafe-inline'");
			return ["script-src", ...sources, ...hashes].join(" ");
		})
		.filter(Boolean)
		.join("; ");
}

/**
 * Where a page's marked CSP `<meta>` is: in `<head>`, with
 * {@link CSP_HASH_MARKER} as an attribute — not merely that text somewhere in
 * the page. Undefined when there is none.
 */
export function markedCspMeta(html: string): { start: number; end: number } | undefined {
	let found: { start: number; end: number } | undefined;
	let inHead = true;
	const parser = new Parser(
		{
			onopentag(name, attribs) {
				if (name === "body") inHead = false;
				if (
					inHead &&
					!found &&
					name === "meta" &&
					CSP_HASH_MARKER in attribs &&
					attribs["http-equiv"]?.toLowerCase() === "content-security-policy"
				)
					found = { start: parser.startIndex, end: parser.endIndex };
			},
			onclosetag(name) {
				if (name === "head") inHead = false;
			},
		},
		{ lowerCaseTags: true, lowerCaseAttributeNames: true },
	);
	parser.end(html);
	return found;
}

/**
 * A built page with its marked CSP `<meta>` (see {@link markedCspMeta})
 * rewritten: `script-src` gets `hashes` (and loses any `'unsafe-inline'`),
 * and the marker is removed. Pages without one come back unchanged.
 */
export function withPageHashes(html: string, hashes: Iterable<string>): string {
	const at = markedCspMeta(html);
	if (!at) return html;
	const sources = [...new Set(hashes)];
	const tag = html
		.slice(at.start, at.end + 1)
		.replace(/\scontent="([^"]*)"/i, (_, policy: string) => {
			const decoded = policy.replaceAll("&#39;", "'").replaceAll("&amp;", "&");
			return ` content="${withScriptHashes(decoded, sources).replaceAll("&", "&amp;")}"`;
		})
		.replace(new RegExp(`\\s${CSP_HASH_MARKER}(?:="[^"]*")?`, "i"), "");
	return html.slice(0, at.start) + tag + html.slice(at.end + 1);
}

export interface HashOptions {
	/** The build's slide mark (see `utils/slide-mark`). */
	mark: string;
	/** Hash inline scripts in slide content too (decks whose content you fully trust). */
	slideScripts?: boolean;
}

/**
 * Rewrite every built page under `dir` that carries a default CSP: its
 * `script-src` gets the allowed inline-script hashes of all those pages.
 * Returns how many pages changed, and the pages with slide scripts left out.
 */
export async function hashBuiltPages(
	dir: string,
	options: HashOptions,
): Promise<{ pages: number; blocked: { file: string; scripts: number }[] }> {
	const pages = new Map<string, string>();
	for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
		const file = join(entry.parentPath, entry.name);
		const html = await readFile(file, "utf8");
		if (markedCspMeta(html)) pages.set(file, html);
	}
	const allowed = new Set<string>();
	const blocked: { file: string; scripts: number }[] = [];
	for (const [file, html] of pages) {
		let left = 0;
		for (const script of inlineScripts(html, options.mark)) {
			if (script.inSlide && !options.slideScripts) left++;
			else allowed.add(script.hash);
		}
		if (left) blocked.push({ file, scripts: left });
	}
	for (const [file, html] of pages) await writeFile(file, withPageHashes(html, allowed));
	return { pages: pages.size, blocked };
}
