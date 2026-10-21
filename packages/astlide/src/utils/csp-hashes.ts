/**
 * Built pages without `script-src 'unsafe-inline'`: after `astro build`, each
 * page's inline `<script>`s — Astlide's own, Astro's, and any a slide brings —
 * are hashed (SHA-256), and the hashes replace `'unsafe-inline'` in the CSP.
 * Every page gets the hashes of all pages in the build: moving between slides
 * swaps pages in place (Astro's ClientRouter), keeping the first page's
 * policy, so it must allow the scripts of the pages it moves to. Only
 * policies Astlide emitted by default are rewritten (their `<meta>` carries
 * {@link CSP_HASH_MARKER}); a `csp` string you set is used as is.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Parser } from "htmlparser2";

/** Attribute on a CSP `<meta>` whose `script-src` gets the page's script hashes. */
export const CSP_HASH_MARKER = "data-astlide-csp";

/** `'sha256-…'` sources of every inline `<script>` in a page, in order, without repeats. */
export function inlineScriptHashes(html: string): string[] {
	const hashes = new Set<string>();
	let open: { end: number; external: boolean } | undefined;
	const parser = new Parser(
		{
			onopentag(name, attribs) {
				if (name === "script") open = { end: parser.endIndex, external: "src" in attribs };
			},
			onclosetag(name) {
				if (name !== "script" || !open) return;
				// The exact characters between the tags: what the browser hashes.
				const body = html.slice(open.end + 1, parser.startIndex);
				if (!open.external)
					hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
				open = undefined;
			},
		},
		{ lowerCaseTags: true, lowerCaseAttributeNames: true },
	);
	parser.end(html);
	return [...hashes];
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
 * A built page with its marked CSP `<meta>` rewritten: `'unsafe-inline'` in
 * `script-src` becomes the hashes of the page's inline scripts plus `extra`
 * (other pages' — see the module notes), and the marker is removed. Pages
 * without a marked `<meta>` come back unchanged.
 */
export function hashPageScripts(html: string, extra: Iterable<string> = []): string {
	if (!html.includes(CSP_HASH_MARKER)) return html;
	const hashes = [...new Set([...inlineScriptHashes(html), ...extra])];
	return html.replace(new RegExp(`<meta\\b[^>]*\\b${CSP_HASH_MARKER}\\b[^>]*>`, "gi"), (tag) =>
		tag
			.replace(/\scontent="([^"]*)"/i, (_, policy: string) => {
				const decoded = policy.replaceAll("&#39;", "'").replaceAll("&amp;", "&");
				return ` content="${withScriptHashes(decoded, hashes).replaceAll("&", "&amp;")}"`;
			})
			.replace(new RegExp(`\\s${CSP_HASH_MARKER}(?:="[^"]*")?`, "i"), ""),
	);
}

/**
 * Rewrite every built page under `dir` ({@link hashPageScripts}), each with
 * the inline-script hashes of all the marked pages; returns how many changed.
 */
export async function hashBuiltPages(dir: string): Promise<number> {
	const pages = new Map<string, string>();
	for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
		const file = join(entry.parentPath, entry.name);
		const html = await readFile(file, "utf8");
		if (html.includes(CSP_HASH_MARKER)) pages.set(file, html);
	}
	const all = new Set<string>();
	for (const html of pages.values()) for (const hash of inlineScriptHashes(html)) all.add(hash);
	for (const [file, html] of pages) await writeFile(file, hashPageScripts(html, all));
	return pages.size;
}
