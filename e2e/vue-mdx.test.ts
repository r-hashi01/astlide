/**
 * The playground's MDX slides rendered by @astlide/vue (Vue's JSX runtime,
 * server-rendered) give the same HTML as the Astro build: the same `.mdx`
 * decks work in Vue. Compared like e2e/react-mdx.test.ts.
 */

import { readFileSync } from "node:fs";
import { parseFragment, serialize } from "parse5";
import { describe, expect, it } from "vitest";
import { readDecks } from "../packages/astlide/src/deck/index";
import { renderMdxToHtml } from "../packages/vue/src/server";

type Node = {
	nodeName: string;
	value?: string;
	attrs?: { name: string; value: string }[];
	childNodes?: Node[];
};

/** Canonical HTML; evened out: CodeBlock's id, style spacing, comments, CodeBlock's inline script in Astro. */
function canon(html: string): string {
	const root = parseFragment(html) as unknown as Node;
	const walk = (n: Node) => {
		n.attrs?.sort((a, b) => a.name.localeCompare(b.name));
		for (const a of n.attrs ?? []) {
			if (a.name === "style") a.value = a.value.replace(/\s*([:;])\s*/g, "$1").replace(/;$/, "");
			if ((a.name === "id" || a.name === "data-cb") && a.value.startsWith("cb-")) a.value = "cb-*";
		}
		if (n.nodeName === "#text" && n.value) n.value = n.value.replace(/\s+/g, " ");
		n.childNodes = (n.childNodes ?? []).filter(
			(c) => c.nodeName !== "#comment" && c.nodeName !== "script",
		);
		for (const c of n.childNodes) walk(c);
	};
	walk(root);
	return serialize(root as never)
		.replace(/> </g, "><")
		.replace(/=""/g, "")
		.trim();
}

function builtContent(page: string): string {
	const at = page.indexOf('<div class="slide-content">');
	const div = (parseFragment(page.slice(at)) as unknown as Node).childNodes?.find(
		(c) => c.nodeName === "div",
	);
	return serialize({ nodeName: "#document-fragment", childNodes: div?.childNodes ?? [] } as never);
}

describe("MDX slides in Vue", () => {
	it("render like the Astro build", async () => {
		const decks = await readDecks("playground/src/content/decks");
		let checked = 0;
		for (const deck of decks)
			for (const slide of deck.slides) {
				if (slide.format !== "mdx" || slide.data.hidden) continue;
				const page = readFileSync(
					`playground/dist/${deck.name}/${slide.number}/index.html`,
					"utf-8",
				);
				expect(canon(await renderMdxToHtml(slide.body)), `${deck.name}/${slide.number}`).toBe(
					canon(builtContent(page)),
				);
				checked++;
			}
		expect(checked).toBeGreaterThan(30);
	}, 120_000);
});
