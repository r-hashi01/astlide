/**
 * The docs as plain Markdown for language models (https://llmstxt.org):
 * `/llms.txt` lists the pages, `/llms-full.txt` has all of them.
 */

import { type CollectionEntry, getCollection } from "astro:content";
import { base, sidebar, site } from "../site.mjs";

export const SUMMARY =
	"Astlide is an Astro integration for slide decks: write slides in MDX, Markdown or HTML under src/content/decks/<deck>/, present them in the browser (presenter window, overview, pen), and export them to PDF, PNG or editable PowerPoint — also in a PowerPoint template's design.";

type Page = CollectionEntry<"docs">;

interface SidebarItem {
	slug?: string;
	label?: string;
	items?: SidebarItem[];
}

/** The page's URL on the published site. */
export const pageUrl = (id: string) => `${site}${base}/${id === "index" ? "" : `${id}/`}`;

/** Pages in sidebar order, grouped as the sidebar groups them (the home page first). */
export async function pageGroups(): Promise<{ label: string; pages: Page[] }[]> {
	const pages = await getCollection("docs");
	const byId = new Map(pages.map((p) => [p.id, p]));
	const used = new Set<string>();
	const take = (slug: string | undefined) => {
		const page = slug ? byId.get(slug) : undefined;
		if (!page || used.has(page.id)) return [];
		used.add(page.id);
		return [page];
	};
	const groups: { label: string; pages: Page[] }[] = [{ label: "Docs", pages: take("index") }];
	for (const item of sidebar as SidebarItem[]) {
		if (item.items)
			groups.push({ label: item.label ?? "", pages: item.items.flatMap((i) => take(i.slug)) });
		else groups[0]?.pages.push(...take(item.slug));
	}
	const rest = pages.filter((p) => !used.has(p.id)).sort((a, b) => a.id.localeCompare(b.id));
	if (rest.length) groups.push({ label: "More", pages: rest });
	return groups.filter((g) => g.pages.length > 0);
}

const attr = (tag: string, name: string) =>
	tag
		.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|\\{"([^"]*)"\\})`))
		?.slice(1)
		.find((v) => v !== undefined);

/** MDX components replaced by what they show: cards by their titles, link cards by links, pictures by alt text. */
const withoutComponents = (text: string) =>
	text
		.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
		.replace(/<LinkCard\b[^>]*\/>/g, (tag) => {
			const href = attr(tag, "href") ?? "";
			const description = attr(tag, "description");
			return `- [${attr(tag, "title") ?? href}](${href})${description ? `: ${description}` : ""}`;
		})
		.replace(/<Image\b[^>]*\/>/g, (tag) => {
			const alt = attr(tag, "alt");
			return alt ? `(Picture: ${alt})` : "";
		})
		.replace(/<Card\b[^>]*>/g, (tag) => {
			const title = attr(tag, "title");
			return title ? `\n**${title}**\n` : "";
		})
		.replace(/<\/?[A-Z][\w.]*\b[^>]*>/g, "");

/** Links to other docs pages, made absolute. */
const absoluteLinks = (line: string) =>
	line.replace(/\]\((\/astlide\/[^)]*)\)/g, (_, path: string) => `](${site}${path})`);

/**
 * A page's Markdown, as a reader without the site sees it: MDX imports and
 * components dropped (cards become bold titles, link cards links, pictures
 * their alt text), site links absolute. Code blocks are left as they are.
 */
export function plainMarkdown(page: Page): string {
	const mdx = page.filePath?.endsWith(".mdx") ?? false;
	const out: string[] = [];
	let fence: string | null = null;
	for (const raw of (page.body ?? "").split("\n")) {
		const marker = raw.match(/^\s*(`{3,}|~{3,})/)?.[1];
		if (fence) {
			out.push(raw);
			if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
			continue;
		}
		if (marker) {
			fence = marker;
			out.push(raw);
			continue;
		}
		if (!mdx) {
			out.push(absoluteLinks(raw));
			continue;
		}
		const unindented = raw.replace(/^\t+/, "");
		if (/^import\s.+\sfrom\s/.test(unindented)) continue;
		// Components outside inline code (`<Fragment>` in backticks is text).
		const line = unindented
			.split(/(`+[^`]*`+)/)
			.map((part, i) => (i % 2 === 1 ? part : withoutComponents(part)))
			.join("");
		if (!line.trim() && raw.trim()) continue; // a line that only held components
		out.push(absoluteLinks(line));
	}
	return out
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
