/**
 * MDX file parser for the PPTX exporter.
 *
 * Extracts frontmatter (YAML between `---` fences) with js-yaml and processes
 * the MDX body through the unified pipeline:
 *
 *   remark-parse → remark-mdx → remark-rehype (custom handlers) → HAST
 *
 * The result is a HAST (HTML Abstract Syntax Tree) where:
 *   • Standard markdown (headings, paragraphs, lists, code, etc.) is fully
 *     resolved to HTML elements (`<h1>`, `<p>`, `<ul>`, `<pre>`, etc.)
 *   • MDX JSX components (`<Left>`, `<Columns>`, `<Math>`, etc.) are converted
 *     to `<div>` / `<span>` elements with `data-component` and `data-*` props
 *   • Children of JSX components are also recursively converted to HAST via
 *     `state.all(node)`, producing a single uniform tree
 *
 * No Astro runtime is involved — this runs as a standalone Node.js script.
 */

import { readFile } from "node:fs/promises";
import type { Root as HastRoot } from "hast";
import jsYaml from "js-yaml";
import type { MdxJsxAttribute, MdxJsxFlowElement } from "mdast-util-mdx-jsx";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

export interface ParsedSlide {
	/** Parsed frontmatter key/value pairs. */
	frontmatter: Record<string, unknown>;
	/** HAST root — fully resolved HTML AST including JSX components. */
	hast: HastRoot;
	/** Absolute path of the source file. */
	filePath: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// ---------------------------------------------------------------------------
// JSX attribute extraction helpers
// ---------------------------------------------------------------------------

/** Capitalize first letter for camelCase data-* property names. */
function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Extract JSX attributes as HAST-compatible `data*` properties. */
function extractJsxProps(
	el: MdxJsxFlowElement | { attributes: MdxJsxFlowElement["attributes"] },
): Record<string, string | boolean> {
	const props: Record<string, string | boolean> = {};
	for (const attr of el.attributes) {
		if (!("name" in attr)) continue;
		const a = attr as MdxJsxAttribute;
		if (a.value === null || a.value === undefined) {
			// Boolean attribute like `<Math display />`
			props[`data${capitalize(a.name)}`] = true;
		} else if (typeof a.value === "string") {
			props[`data${capitalize(a.name)}`] = a.value;
		} else if (typeof a.value === "object" && a.value.type === "mdxJsxAttributeValueExpression") {
			// Expression attribute like `columns={3}` → value is "3"
			props[`data${capitalize(a.name)}`] = a.value.value;
		}
	}
	return props;
}

// ---------------------------------------------------------------------------
// Unified processor: remark-parse → remark-mdx → remark-rehype → HAST
// ---------------------------------------------------------------------------

const processor = unified()
	.use(remarkParse)
	.use(remarkMdx)
	.use(remarkRehype, {
		// allowDangerousHtml is required to pass raw HTML nodes from remark-mdx through
		// the remark→rehype bridge intact. MDX files are developer-authored (not user
		// input), so this does not introduce a runtime XSS risk.
		allowDangerousHtml: true,
		handlers: {
			// Convert MDX JSX flow elements (block-level) to HAST div elements
			mdxJsxFlowElement(state, node) {
				const el = node as unknown as MdxJsxFlowElement;
				return {
					type: "element" as const,
					tagName: "div",
					properties: {
						dataComponent: el.name ?? "",
						...extractJsxProps(el),
					},
					children: state.all(node),
				};
			},
			// Convert MDX JSX text elements (inline) to HAST span elements
			mdxJsxTextElement(state, node) {
				const el = node as unknown as MdxJsxFlowElement;
				return {
					type: "element" as const,
					tagName: "span",
					properties: {
						dataComponent: el.name ?? "",
						...extractJsxProps(el),
					},
					children: state.all(node),
				};
			},
			// Skip ESM import/export statements
			mdxjsEsm() {
				return undefined;
			},
			// Skip MDX expression statements (e.g. {/* comments */})
			mdxFlowExpression() {
				return undefined;
			},
			mdxTextExpression() {
				return undefined;
			},
		},
	});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseMdxFile(filePath: string): Promise<ParsedSlide> {
	const raw = await readFile(filePath, "utf-8");

	let frontmatter: Record<string, unknown> = {};
	let body = raw;

	const fmMatch = raw.match(FRONTMATTER_RE);
	if (fmMatch) {
		frontmatter = (jsYaml.load(fmMatch[1]) as Record<string, unknown>) ?? {};
		body = raw.slice(fmMatch[0].length);
	}

	// Parse MDX → MDAST, then transform MDAST → HAST via remark-rehype
	const mdast = processor.parse(body);
	const hast = (await processor.run(mdast)) as HastRoot;

	return { frontmatter, hast, filePath };
}
