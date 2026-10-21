/**
 * What an embedded page (an `<iframe>` of another site) shows, for exports
 * that can't run it: a title, a thumbnail and the link to open it. From
 * oEmbed (the providers' own API, or the endpoint a page advertises) or the
 * page's Open Graph tags. Results are cached on disk; offline, nothing is
 * known and the exporter falls back to a plain linked card.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { exportFetch } from "@astlide/core/utils/network.ts";
import { Parser } from "htmlparser2";

export interface EmbedInfo {
	/** The page to open (the watch / pen / file page rather than the player). */
	link: string;
	title?: string;
	thumbnail?: string;
}

/** Known players → the page they show and its oEmbed endpoint. */
const PROVIDERS: {
	match: RegExp;
	page: (m: RegExpMatchArray) => string;
	oembed: (page: string) => string;
}[] = [
	{
		match: /^https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/,
		page: (m) => `https://www.youtube.com/watch?v=${m[1]}`,
		oembed: (page) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(page)}`,
	},
	{
		match: /^https?:\/\/player\.vimeo\.com\/video\/(\d+)/,
		page: (m) => `https://vimeo.com/${m[1]}`,
		oembed: (page) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(page)}`,
	},
	{
		match: /^https?:\/\/codepen\.io\/((?:team\/)?[\w-]+)\/embed\/(?:preview\/)?([\w-]+)/,
		page: (m) => `https://codepen.io/${m[1]}/pen/${m[2]}`,
		oembed: (page) => `https://codepen.io/api/oembed?format=json&url=${encodeURIComponent(page)}`,
	},
	{
		match: /^https?:\/\/(?:www\.)?figma\.com\/embed\?.*?\burl=([^&]+)/,
		page: (m) => decodeURIComponent(m[1] ?? ""),
		oembed: (page) => `https://www.figma.com/api/oembed?url=${encodeURIComponent(page)}`,
	},
];

const TIMEOUT = 10_000;
/** Largest page / oEmbed response read, in bytes. */
const PAGE_LIMIT = 2 * 1024 * 1024;
/** How much of a page is read for its tags (they're in `<head>`). */
const HEAD_LIMIT = 512 * 1024;

/** `url` when it is http(s) — what a link in the exported deck may open. */
function webUrl(url: string | undefined, base?: string): string | undefined {
	if (!url) return undefined;
	try {
		const u = new URL(url, base);
		return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
	} catch {
		return undefined;
	}
}

/** A page's text; `source` as in {@link exportFetch} (who chose the URL). */
async function getText(url: string, source: "deck" | "remote"): Promise<string | null> {
	try {
		const res = await exportFetch(url, {
			limit: PAGE_LIMIT,
			timeoutMs: TIMEOUT,
			source,
			headers: { "user-agent": "Mozilla/5.0 (compatible; astlide-export)" },
		});
		return res.ok ? res.body.toString("utf-8") : null;
	} catch {
		return null;
	}
}

async function oembed(
	url: string,
	source: "deck" | "remote",
): Promise<{ title?: string; thumbnail?: string } | null> {
	const text = await getText(url, source);
	if (!text) return null;
	try {
		const data = JSON.parse(text) as { title?: unknown; thumbnail_url?: unknown };
		return {
			title: typeof data.title === "string" ? data.title : undefined,
			thumbnail: typeof data.thumbnail_url === "string" ? webUrl(data.thumbnail_url) : undefined,
		};
	} catch {
		return null;
	}
}

/** What a page's `<head>` says about it: `<meta property|name>` values, its oEmbed link, its title. */
export function pageTags(html: string): {
	meta: Map<string, string>;
	oembed?: string;
	title?: string;
} {
	const meta = new Map<string, string>();
	let oembed: string | undefined;
	let title: string | undefined;
	let inTitle = false;
	// A parser, not regexes: linear on any input (a page is someone else's).
	const parser = new Parser(
		{
			onopentag(name, attrs) {
				if (name === "meta") {
					const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
					if (key && attrs.content && !meta.has(key)) meta.set(key, attrs.content);
				} else if (name === "link" && attrs.type?.toLowerCase() === "application/json+oembed")
					oembed ??= attrs.href;
				else if (name === "title" && title === undefined) {
					inTitle = true;
					title = "";
				}
			},
			ontext(text) {
				if (inTitle) title += text;
			},
			onclosetag(name) {
				if (name === "title") inTitle = false;
			},
		},
		{ decodeEntities: true },
	);
	parser.end(html.slice(0, HEAD_LIMIT));
	return { meta, oembed, title: title?.trim() || undefined };
}

async function lookup(src: string): Promise<EmbedInfo> {
	for (const p of PROVIDERS) {
		const m = src.match(p.match);
		if (!m) continue;
		let page: string | undefined;
		try {
			page = webUrl(p.page(m));
		} catch {}
		if (!page) return { link: src };
		return { link: page, ...((await oembed(p.oembed(page), "deck")) ?? {}) };
	}
	// Any page: the oEmbed endpoint it advertises, else its Open Graph tags.
	const html = await getText(src, "deck");
	if (!html) return { link: src };
	const tags = pageTags(html);
	const endpoint = webUrl(tags.oembed, src);
	if (endpoint) {
		const info = await oembed(endpoint, "remote");
		if (info?.thumbnail || info?.title) return { link: src, ...info };
	}
	return {
		link: webUrl(tags.meta.get("og:url"), src) ?? src,
		title: tags.meta.get("og:title") ?? tags.title,
		thumbnail: webUrl(tags.meta.get("og:image") ?? tags.meta.get("twitter:image"), src),
	};
}

/** Look up embedded pages (cached under `cacheDir`). */
export async function resolveEmbeds(
	srcs: string[],
	cacheDir: string,
): Promise<Map<string, EmbedInfo>> {
	await mkdir(cacheDir, { recursive: true });
	const out = new Map<string, EmbedInfo>();
	await Promise.all(
		srcs.map(async (src) => {
			const file = join(
				cacheDir,
				`${createHash("sha256").update(src).digest("hex").slice(0, 32)}.json`,
			);
			if (existsSync(file)) {
				out.set(src, JSON.parse(readFileSync(file, "utf-8")) as EmbedInfo);
				return;
			}
			// One page failing doesn't stop the others (or the export).
			const info = await lookup(src).catch((): EmbedInfo => ({ link: src }));
			out.set(src, info);
			// Only what was found is cached: offline runs try again next time.
			if (info.title || info.thumbnail) await writeFile(file, JSON.stringify(info));
		}),
	);
	return out;
}
