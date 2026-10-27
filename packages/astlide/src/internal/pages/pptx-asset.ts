/**
 * Serves the pictures and fonts of `.pptx` slides (see utils/pptx-assets):
 * read on request in dev; at build, one static file per asset the site uses —
 * referenced by a slide that isn't hidden, or by a template's art or theme
 * CSS. The cache keeps files of removed decks, older versions of a `.pptx` and
 * hidden slides; those aren't published.
 */

import { getCollection } from "astro:content";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { templateAssets, templates } from "virtual:astlide/templates";
import { PPTX_ASSET_TYPES, referencedAssets } from "@astlide/core/utils/pptx-assets";
import type { APIRoute, GetStaticPaths } from "astro";

declare const __ASTLIDE_PPTX_ASSETS__: string;

const NAME = /^[0-9a-f]{24}\.[a-z0-9]+$/;

/** The asset names the built site references. */
async function usedAssets(): Promise<Set<string>> {
	const used = new Set<string>(templateAssets);
	for (const name of referencedAssets(JSON.stringify(templates))) used.add(name);
	for (const entry of await getCollection("decks")) {
		if (entry.data.hidden) continue;
		for (const name of referencedAssets(entry.rendered?.html ?? "")) used.add(name);
	}
	return used;
}

export const getStaticPaths: GetStaticPaths = async () => {
	const files = await readdir(__ASTLIDE_PPTX_ASSETS__).catch(() => [] as string[]);
	const used = await usedAssets();
	return files
		.filter((f) => NAME.test(f) && Object.hasOwn(PPTX_ASSET_TYPES, extname(f)) && used.has(f))
		.map((file) => ({ params: { file } }));
};

export const GET: APIRoute = async ({ params }) => {
	const file = params.file ?? "";
	const type = Object.hasOwn(PPTX_ASSET_TYPES, extname(file))
		? PPTX_ASSET_TYPES[extname(file)]
		: undefined;
	if (!NAME.test(file) || !type) return new Response("not found", { status: 404 });
	try {
		const data = await readFile(join(__ASTLIDE_PPTX_ASSETS__, file));
		return new Response(data, {
			headers: {
				"content-type": type,
				"x-content-type-options": "nosniff",
				"cache-control": "public, max-age=31536000, immutable",
			},
		});
	} catch {
		return new Response("not found", { status: 404 });
	}
};
