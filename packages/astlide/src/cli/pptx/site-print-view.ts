/**
 * A deck's print view from a running site (`astlide export --pptx
 * --base-url`), saved as files for the PPTX exporter: for sites written
 * without Astro (Next.js, Nuxt, React, Vue), which have no `dist/` to read.
 *
 * The page is saved as the exporter reads an Astro build: the slides
 * (`.slide` not inside another) right in `<body>`, no scripts, and every
 * same-site URL of the page and its stylesheets (fonts, pictures) made
 * root-relative and downloaded next to it. URLs of other sites stay as they
 * are (the exporter fetches remote pictures itself).
 *
 * @module
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
	type PrintViewInfo,
	printViewAttributes,
	readPrintViewMeta,
} from "@astlide/core/deck/print-view";
import { FetchBudget } from "@astlide/core/utils/network.ts";
import render from "dom-serializer";
import { type ChildNode, type Element, isTag, Text } from "domhandler";
import { parseDocument } from "htmlparser2";

export interface SitePrintView {
	/** The saved print view page. */
	html: string;
	/** The folder its root-relative URLs resolve in. */
	site: string;
	/** The deck's title, author and theme, from the page's `astlide:*` meta tags. */
	config: PrintViewInfo;
}

const PAGE_LIMIT = 20 * 1024 * 1024;
const FILE_LIMIT = 25 * 1024 * 1024;

/** `url(…)` values in a stylesheet or a `style` attribute, with their positions. */
export function cssUrls(css: string): { start: number; end: number; url: string }[] {
	const found: { start: number; end: number; url: string }[] = [];
	const lower = css.toLowerCase();
	let at = 0;
	for (;;) {
		const open = lower.indexOf("url(", at);
		if (open < 0) return found;
		// Not part of a longer name (e.g. `myurl(`).
		const before = open > 0 ? lower.charCodeAt(open - 1) : 0;
		const inName =
			(before >= 97 && before <= 122) || (before >= 48 && before <= 57) || before === 45;
		const close = css.indexOf(")", open + 4);
		if (close < 0) return found;
		at = close + 1;
		if (inName) continue;
		let url = css.slice(open + 4, close).trim();
		const quote = url[0];
		if ((quote === '"' || quote === "'") && url.endsWith(quote)) url = url.slice(1, -1);
		found.push({ start: open, end: close + 1, url });
	}
}

/** `text` with each `url(…)` replaced by what `map` returns for it (or left as is). */
function replaceCssUrls(text: string, map: (url: string) => string | undefined): string {
	let out = "";
	let last = 0;
	for (const { start, end, url } of cssUrls(text)) {
		const to = map(url);
		if (to === undefined) continue;
		out += `${text.slice(last, start)}url(${JSON.stringify(to)})`;
		last = end;
	}
	return out + text.slice(last);
}

function* descendants(node: { children?: ChildNode[] }): Generator<Element> {
	for (const c of node.children ?? []) {
		if (!isTag(c)) continue;
		yield c;
		yield* descendants(c);
	}
}

const classes = (el: Element) => (el.attribs.class ?? "").split(/\s+/);

/** The deck's slides: `.slide` elements not inside another slide. */
function topSlides(node: { children?: ChildNode[] }): Element[] {
	const out: Element[] = [];
	for (const c of node.children ?? []) {
		if (!isTag(c)) continue;
		if (classes(c).includes("slide")) out.push(c);
		else out.push(...topSlides(c));
	}
	return out;
}

/** Save the print view of `deck` at `baseUrl` into `dir`. */
export async function savePrintView(
	baseUrl: string,
	deck: string,
	dir: string,
): Promise<SitePrintView> {
	const budget = new FetchBudget({ maxUrls: 500 });
	const page = await budget.fetch(`${baseUrl}/${encodeURIComponent(deck)}/all`, {
		limit: PAGE_LIMIT,
		timeoutMs: 60_000,
	});
	if (!page.ok) throw new Error(`no print view of "${deck}" at ${page.url} (HTTP ${page.status})`);
	const origin = new URL(page.url).origin;
	const site = resolve(dir);

	// Same-site URLs as root-relative paths; the files are downloaded below.
	const files = new Map<string, Promise<void>>();
	const local = (url: string, against: string): string | undefined => {
		if (!url || url.startsWith("data:") || url.startsWith("#")) return undefined;
		let abs: URL;
		try {
			abs = new URL(url, against);
		} catch {
			return undefined;
		}
		if (abs.origin !== origin)
			return abs.protocol === "http:" || abs.protocol === "https:" ? abs.href : undefined;
		if (!files.has(abs.pathname)) files.set(abs.pathname, download(abs.href, abs.pathname));
		return abs.pathname;
	};
	const fileFor = (pathname: string) => {
		let rel: string;
		try {
			rel = decodeURIComponent(pathname);
		} catch {
			rel = pathname;
		}
		const file = resolve(site, `.${rel.endsWith("/") ? `${rel}index.html` : rel}`);
		return file.startsWith(site + sep) ? file : null;
	};
	async function download(href: string, pathname: string): Promise<void> {
		const file = fileFor(pathname);
		if (!file) return;
		try {
			const res = await budget.fetch(href, { limit: FILE_LIMIT, timeoutMs: 60_000 });
			if (!res.ok) return;
			let body: Buffer | string = res.body;
			if (/\.css$/i.test(pathname) || /text\/css/.test(res.headers.get("content-type") ?? ""))
				body = replaceCssUrls(res.body.toString("utf-8"), (u) => local(u, res.url));
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, body);
		} catch {
			// A file that can't be had is left out, as a missing file in a build would be.
		}
	}

	const doc = parseDocument(page.body.toString("utf-8"));
	const all = [...descendants(doc)];
	const html = all.find((e) => e.name === "html");
	const head = all.find((e) => e.name === "head");
	const body = all.find((e) => e.name === "body");
	if (!html || !body) throw new Error(`the print view at ${page.url} has no <html> / <body>`);

	const headParts: string[] = ['<meta charset="utf-8">'];
	for (const el of head ? descendants(head) : []) {
		if (el.name === "link" && (el.attribs.rel ?? "").split(/\s+/).includes("stylesheet")) {
			const href = local(el.attribs.href ?? "", page.url);
			// Only the site's own stylesheets: fonts of other sites (Google Fonts) are found by family.
			if (href?.startsWith("/")) headParts.push(`<link rel="stylesheet" href="${href}">`);
		} else if (el.name === "style") {
			const css = el.children.map((c) => (c instanceof Text ? c.data : "")).join("");
			headParts.push(`<style>${replaceCssUrls(css, (u) => local(u, page.url))}</style>`);
		}
	}

	// The deck, as the print view states it (`@astlide/core/deck/print-view`), and
	// the <html> attributes a print view has: a page may set them from a script
	// (Next.js: the root layout owns <html>), and scripts don't run here.
	const config = readPrintViewMeta(
		(name) => all.find((e) => e.name === "meta" && e.attribs.name === name)?.attribs.content,
		{ deck },
	);
	for (const [k, v] of Object.entries(printViewAttributes(config))) html.attribs[k] ??= v;

	const slides = topSlides(body);
	for (const slide of slides)
		for (const el of [slide, ...descendants(slide)]) {
			for (const attr of ["src", "poster"] as const) {
				const value = el.attribs[attr];
				if (value && el.name !== "iframe" && el.name !== "script") {
					const to = local(value, page.url);
					if (to) el.attribs[attr] = to;
				}
			}
			if (el.attribs.style)
				el.attribs.style = replaceCssUrls(el.attribs.style, (u) => local(u, page.url));
		}
	// Scripts don't run in the exporter; leave them out.
	const withoutScripts = (nodes: ChildNode[]) =>
		nodes.filter((n) => !(isTag(n) && (n.name === "script" || n.name === "noscript")));
	for (const el of all) el.children = withoutScripts(el.children);

	const attrs = (el: Element) =>
		Object.entries(el.attribs)
			.map(([k, v]) => ` ${k}="${v.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`)
			.join("");
	const source = `<!DOCTYPE html><html${attrs(html)}><head>${headParts.join("")}</head><body${attrs(body)}>${render(slides, { encodeEntities: "utf8" })}</body></html>`;

	// Stylesheets add the files they use while they download.
	for (let n = -1; n !== files.size; ) {
		n = files.size;
		await Promise.all(files.values());
	}
	const pagePath = new URL(page.url).pathname;
	const file = fileFor(pagePath.endsWith("/") ? pagePath : `${pagePath}/`);
	if (!file) throw new Error(`can't save the print view at ${page.url}`);
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, source);

	return { html: file, site, config };
}
