/**
 * The playground's MDX slides rendered by @astlide/react (compiled with
 * compileSlideMdx) give the same HTML as the Astro build: what makes the
 * same `.mdx` decks work in React. Compared as canonical HTML (attribute
 * order, whitespace); a few known, harmless differences are evened out.
 */

import { readFileSync } from "node:fs";
import { parseFragment, serialize } from "parse5";
import { createElement } from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { evaluateSlideMdx, readDecks } from "../packages/astlide/src/deck/index";
import { mdxComponents } from "../packages/react/src/index";

type Node = {
	nodeName: string;
	value?: string;
	attrs?: { name: string; value: string }[];
	childNodes?: Node[];
};

/** Canonical HTML. Evened out: CodeBlock's random id, React's style spacing and image preload links, HTML comments, CodeBlock's inline script in Astro. */
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
			(c) =>
				c.nodeName !== "#comment" &&
				c.nodeName !== "script" &&
				!(c.nodeName === "link" && c.attrs?.some((a) => a.name === "rel" && a.value === "preload")),
		);
		for (const c of n.childNodes) walk(c);
	};
	walk(root);
	return serialize(root as never)
		.replace(/> </g, "><")
		.replace(/=""/g, "")
		.trim();
}

/** A built page's slide content (inside <div class="slide-content">). */
function builtContent(page: string): string {
	const at = page.indexOf('<div class="slide-content">');
	const div = (parseFragment(page.slice(at)) as unknown as Node).childNodes?.find(
		(c) => c.nodeName === "div",
	);
	return serialize({ nodeName: "#document-fragment", childNodes: div?.childNodes ?? [] } as never);
}

describe("MDX slides in React", () => {
	it("render like the Astro build", async () => {
		const decks = await readDecks("playground/src/content/decks");
		const checked: string[] = [];
		for (const deck of decks)
			for (const slide of deck.slides) {
				if (slide.format !== "mdx" || slide.data.hidden) continue;
				const page = readFileSync(
					`playground/dist/${deck.name}/${slide.number}/index.html`,
					"utf-8",
				);
				const { default: Content } = (await evaluateSlideMdx(slide.body, runtime as never)) as {
					default: Parameters<typeof createElement>[0];
				};
				const react = renderToStaticMarkup(createElement(Content, { components: mdxComponents }));
				expect(canon(react), `${deck.name}/${slide.number}`).toBe(canon(builtContent(page)));
				checked.push(`${deck.name}/${slide.number}`);
			}
		expect(checked.length).toBeGreaterThan(30);
	}, 120_000);
});
