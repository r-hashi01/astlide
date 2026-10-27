/**
 * `template_layouts`: what a PowerPoint template offers a deck — its slide
 * layouts (the `slideLayout` names to write) and which built-in Astlide
 * layouts are drawn with which of them.
 *
 * @module
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { pptxToTemplate } from "@astlide/core/pptx";

/** One layout of a template, as an agent needs it to write slides. */
export interface TemplateLayoutInfo {
	/** The Astlide name: use it as `slideLayout`. */
	id: string;
	/** The layout's name in PowerPoint ("Title and Content"). */
	name: string;
	/** OOXML layout type ("title", "obj", "secHead" …), if the template sets one. */
	type?: string;
	/** Has a title placeholder (the slide's first heading goes there). */
	hasTitle: boolean;
	/** Content placeholders (subtitle / body / object), in reading order. */
	bodyCount: number;
	/** Shows the slide number. */
	hasSlideNumber: boolean;
	/** Built-in Astlide layouts drawn with this one (`cover`, `default` …). */
	aliases: string[];
}

export interface TemplateLayoutsResult {
	/** Slide size in px on Astlide's 1920-wide canvas. */
	size: { width: number; height: number };
	colors: Record<string, string>;
	fonts: { heading?: string; body?: string };
	layouts: TemplateLayoutInfo[];
	/** Built-in layout → template layout id. */
	aliases: Record<string, string>;
}

export const TEMPLATE_EXTENSIONS = new Set([".pptx", ".potx", ".thmx"]);

/** Read a template's layouts from its bytes. */
export function templateLayouts(data: Uint8Array): TemplateLayoutsResult {
	const t = pptxToTemplate(data);
	const byLayout = new Map<string, string[]>();
	for (const [builtIn, id] of Object.entries(t.aliases))
		byLayout.set(id, [...(byLayout.get(id) ?? []), builtIn]);
	return {
		size: { width: 1920, height: Math.round((1920 * t.height) / t.width) },
		colors: t.colors,
		fonts: t.fonts,
		layouts: t.layouts.map((l) => ({
			id: l.id,
			name: l.name,
			...(l.type ? { type: l.type } : {}),
			hasTitle: !!l.title,
			bodyCount: l.body.length,
			hasSlideNumber: !!l.slideNumber,
			aliases: byLayout.get(l.id) ?? [],
		})),
		aliases: t.aliases,
	};
}

/** Read a template's layouts from a .pptx / .potx / .thmx file. */
export async function templateLayoutsFromFile(path: string): Promise<TemplateLayoutsResult> {
	if (!TEMPLATE_EXTENSIONS.has(extname(path).toLowerCase()))
		throw new Error(`${path}: expected a .pptx, .potx or .thmx file`);
	return templateLayouts(await readFile(path));
}
