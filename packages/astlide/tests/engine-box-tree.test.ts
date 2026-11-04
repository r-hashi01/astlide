import { createRequire } from "node:module";
import { join } from "node:path";
import type { Element } from "domhandler";
import { parseDocument } from "htmlparser2";
import { describe, expect, it } from "vitest";
import { type ElementBox, StyleContext, type TextRun } from "../src/engine/box-tree";
import { StyleSheets, UA_CSS } from "../src/engine/cascade";
import { FontRegistry } from "../src/engine/text";

const vp = { width: 1000, height: 600, media: "screen" as const };
/** A font every install has (KaTeX ships TrueType): runs of text resolve one. */
const FONT = join(
	createRequire(import.meta.url).resolve("katex/package.json"),
	"..",
	"dist",
	"fonts",
	"KaTeX_Main-Regular.ttf",
);

/** The box tree of the `<section>` in `body`. */
function tree(css: string, body: string): ElementBox {
	const sheets = new StyleSheets(vp);
	sheets.add(UA_CSS, 0);
	sheets.add(css);
	const doc = parseDocument(`<html><body><section>${body}</section></body></html>`);
	const find = (n: { children?: unknown[] }, name: string): Element | undefined => {
		for (const c of (n.children ?? []) as Element[]) {
			if (c.name === name) return c;
			const deeper = find(c, name);
			if (deeper) return deeper;
		}
		return undefined;
	};
	const section = find(doc, "section") as Element;
	const fonts = new FontRegistry();
	fonts.add("T", 400, false, FONT);
	const ctx = new StyleContext(sheets, fonts, vp);
	const box = ctx.box(section, ctx.styleOf(section, null));
	if (!box) throw new Error("no box");
	return box;
}

/** A compact picture of a tree: kinds, tags and text. */
function shape(b: ElementBox | TextRun): unknown {
	if (b.type === "text")
		return `text${b.inFlow ? "" : "-item"}:${b.items.flatMap((i) => (i.kind === "text" ? [i.text.trim()] : [])).join("")}`;
	const own = `${b.kind}:${b.el.name}`;
	if (b.rows) return [own, b.rows.map((r) => r.cells.map((c) => `${shape(c.box)}×${c.span}`))];
	return b.children.length ? [own, b.children.map(shape)] : own;
}

describe("box tree", () => {
	it("groups inline content into runs between block boxes", () => {
		expect(shape(tree("", "Hello <b>bold</b><div>Block</div> tail <img>"))).toEqual([
			"block:section",
			["text:Hellobold", ["block:div", ["text:Block"]], "text:tail", "replaced:img"],
		]);
	});

	it("makes each text of a flex or grid container its own item, and skips display: none", () => {
		expect(
			shape(
				tree(
					".f{display:flex}.g{display:grid}.n{display:none}",
					'<div class="f">a<span class="n">x</span><p>b</p>c</div><div class="g">d</div>',
				),
			),
		).toEqual([
			"block:section",
			[
				["flex:div", ["text-item:a", ["block:p", ["text:b"]], "text-item:c"]],
				["grid:div", ["text-item:d"]],
			],
		]);
	});

	it("orders table rows header first and footer last, with spans", () => {
		const t = tree(
			"",
			'<table><tfoot><tr><td>F</td></tr></tfoot><tbody><tr><td colspan="2">B</td></tr></tbody><thead><tr><th>H</th></tr></thead></table>',
		);
		const table = t.children[0] as ElementBox;
		expect(table.kind).toBe("table");
		expect(table.rows?.map((r) => r.cells.map((c) => [shape(c.box), c.span]))).toEqual([
			[[["block:th", ["text:H"]], 1]],
			[[["block:td", ["text:B"]], 2]],
			[[["block:td", ["text:F"]], 1]],
		]);
	});

	it("gives ::before / ::after content boxes", () => {
		expect(
			shape(tree("p::before{content:'» '}p::after{content:attr(data-x)}", '<p data-x="!">Hi</p>')),
		).toEqual(["block:section", [["block:p", ["text:»Hi!"]]]]);
	});
});
