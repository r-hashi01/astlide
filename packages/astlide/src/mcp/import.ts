/**
 * `import_pptx`: read a PowerPoint deck as text an agent can work with —
 * each slide's title, notes and content as Markdown — and optionally turn
 * it into an editable Astlide deck with `astlide import`.
 *
 * @module
 */

import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pptxToSlides } from "@astlide/core/pptx";
import type { ChildNode, Element } from "domhandler";
import { parseDocument } from "htmlparser2";
import { projectRoot, runAstlide } from "./project";

export interface ImportedSlideText {
	/** 1-based position in the presentation. */
	index: number;
	title?: string;
	notes: string;
	hidden: boolean;
	/** The slide's text as Markdown: one paragraph per line, bullets as lists, tables as tables. */
	markdown: string;
	/** The slide as an Astlide `.html` slide body (pictures as `media/<name>`), when asked for. */
	html?: string;
}

export interface ImportResult {
	title?: string;
	author?: string;
	slides: ImportedSlideText[];
	/** The deck written by `astlide import`, when a project was given. */
	written?: { dir: string; slides: number };
}

export interface ImportOptions {
	/** The .pptx file. */
	path: string;
	/** An Astlide project to write the deck into (src/content/decks/<deck>); omit to only read. */
	projectRoot?: string;
	/** Deck folder name (default: from the file name). */
	deck?: string;
	/** Replace an existing deck folder. */
	force?: boolean;
	/** Include each slide's HTML. */
	includeHtml?: boolean;
}

const isTag = (n: ChildNode): n is Element => n.type === "tag";

function textOf(node: ChildNode): string {
	if (node.type === "text") return node.data;
	if (isTag(node)) {
		if (node.name === "br") return "\n";
		return node.children.map(textOf).join("");
	}
	return "";
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** A paragraph's list marker (the imported `display:inline-block` span), if any. */
function marker(p: Element): Element | undefined {
	const first = p.children.find((c) => isTag(c) || (c.type === "text" && c.data.trim()));
	if (first && isTag(first) && /display:\s*inline-block/.test(first.attribs.style ?? ""))
		return first;
	return undefined;
}

const px = (style: string, prop: string) =>
	Number.parseFloat(style.match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([\\d.]+)px`))?.[1] ?? "0");

function paragraph(p: Element): string {
	const m = marker(p);
	const text = clean(
		p.children
			.filter((c) => c !== m)
			.map(textOf)
			.join(""),
	);
	if (!text) return "";
	if (!m) return text;
	const width = px(m.attribs.style ?? "", "width") || 1;
	const level = Math.max(0, Math.round(px(p.attribs.style ?? "", "padding-left") / width) - 1);
	const bullet = clean(textOf(m));
	const numbered = /^\(?[\da-z]+[.)]$/i.test(bullet);
	return `${"  ".repeat(level)}${numbered ? bullet : "-"} ${text}`;
}

function table(t: Element): string[] {
	const rows: string[][] = [];
	const walk = (n: ChildNode) => {
		if (!isTag(n)) return;
		if (n.name === "tr")
			rows.push(n.children.filter(isTag).map((c) => clean(textOf(c)).replace(/[\\|]/g, "\\$&")));
		else n.children.forEach(walk);
	};
	t.children.forEach(walk);
	if (rows.length === 0) return [];
	const cols = Math.max(...rows.map((r) => r.length));
	const line = (r: string[]) =>
		`| ${Array.from({ length: cols }, (_, i) => r[i] ?? "").join(" | ")} |`;
	const [head = [], ...body] = rows;
	return [line(head), `|${" --- |".repeat(cols)}`, ...body.map(line)];
}

/** An imported slide's HTML as Markdown: its paragraphs, lists, tables and pictures, in order. */
export function slideMarkdown(html: string, title?: string): string {
	const out: string[] = title ? [`# ${title}`] : [];
	let titleSeen = false;
	const walk = (n: ChildNode) => {
		if (!isTag(n) || n.name === "style") return;
		if (n.name === "p") {
			const line = paragraph(n);
			if (!line) return;
			if (title && !titleSeen && line === clean(title)) {
				titleSeen = true;
				return;
			}
			out.push(line);
		} else if (n.name === "table") {
			out.push("", ...table(n), "");
		} else if (n.name === "img") {
			out.push(`![${n.attribs.alt ?? ""}](${n.attribs.src ?? ""})`);
		} else n.children.forEach(walk);
	};
	parseDocument(html).children.forEach(walk);
	return out
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/** Read a deck from its bytes (pictures as `media/<name>` references). */
export function readPptx(data: Uint8Array, includeHtml = false): ImportResult {
	const deck = pptxToSlides(data, { media: (f) => `media/${f.name.split("/").pop()}` });
	return {
		...(deck.title ? { title: deck.title } : {}),
		...(deck.author ? { author: deck.author } : {}),
		slides: deck.slides.map((s) => ({
			index: s.index,
			...(s.title ? { title: s.title } : {}),
			notes: s.notes,
			hidden: s.hidden,
			markdown: slideMarkdown(s.html, s.title),
			...(includeHtml ? { html: s.html } : {}),
		})),
	};
}

export async function importPptx(options: ImportOptions): Promise<ImportResult> {
	const path = resolve(options.path);
	if (extname(path).toLowerCase() !== ".pptx")
		throw new Error(`${path}: expected a .pptx file (save .ppt / .key / .odp as PowerPoint first)`);
	const result = readPptx(await readFile(path), options.includeHtml);
	if (!options.projectRoot) return result;
	const root = projectRoot(options.projectRoot);
	const r = await runAstlide(root, [
		"import",
		path,
		...(options.deck ? ["--deck", options.deck] : []),
		...(options.force ? ["--force"] : []),
	]);
	const done = r.stdout.match(/Imported (\d+) slides → (.+)/);
	if (r.code !== 0 || !done)
		throw new Error(`astlide import failed:\n${`${r.stdout}${r.stderr}`.trim()}`);
	return { ...result, written: { dir: (done[2] ?? "").trim(), slides: Number(done[1]) } };
}
