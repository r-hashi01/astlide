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

async function getText(url: string): Promise<string | null> {
	try {
		const res = await exportFetch(url, {
			limit: PAGE_LIMIT,
			timeoutMs: TIMEOUT,
			headers: { "user-agent": "Mozilla/5.0 (compatible; astlide-export)" },
		});
		return res.ok ? res.body.toString("utf-8") : null;
	} catch {
		return null;
	}
}

async function oembed(url: string): Promise<{ title?: string; thumbnail?: string } | null> {
	const text = await getText(url);
	if (!text) return null;
	try {
		const data = JSON.parse(text) as { title?: unknown; thumbnail_url?: unknown };
		return {
			title: typeof data.title === "string" ? data.title : undefined,
			thumbnail: typeof data.thumbnail_url === "string" ? data.thumbnail_url : undefined,
		};
	} catch {
		return null;
	}
}

const decode = (s: string) =>
	s.replace(
		/&(amp|lt|gt|quot|#39);/g,
		(_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e] ?? "",
	);

/** `content` of a `<meta property|name=…>` tag. */
function meta(html: string, key: string): string | undefined {
	for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
		const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
		if (name?.toLowerCase() !== key) continue;
		const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
		if (content) return decode(content);
	}
	return undefined;
}

async function lookup(src: string): Promise<EmbedInfo> {
	for (const p of PROVIDERS) {
		const m = src.match(p.match);
		if (!m) continue;
		const page = p.page(m);
		return { link: page, ...((await oembed(p.oembed(page))) ?? {}) };
	}
	// Any page: the oEmbed endpoint it advertises, else its Open Graph tags.
	const html = await getText(src);
	if (!html) return { link: src };
	const endpoint = html
		.match(/<link\b[^>]*type\s*=\s*["']application\/json\+oembed["'][^>]*>/i)?.[0]
		.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
	if (endpoint) {
		const info = await oembed(decode(endpoint));
		if (info?.thumbnail || info?.title) return { link: src, ...info };
	}
	const image = meta(html, "og:image") ?? meta(html, "twitter:image");
	return {
		link: meta(html, "og:url") ?? src,
		title:
			meta(html, "og:title") ??
			(decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "") || undefined),
		thumbnail: image ? new URL(image, src).href : undefined,
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
			const info = await lookup(src);
			out.set(src, info);
			// Only what was found is cached: offline runs try again next time.
			if (info.title || info.thumbnail) await writeFile(file, JSON.stringify(info));
		}),
	);
	return out;
}
