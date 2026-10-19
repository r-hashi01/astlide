/**
 * Serves the pictures and fonts of `.pptx` slides (see utils/pptx-assets):
 * one static file per stored asset at build, read on request in dev.
 */

import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { PPTX_ASSET_TYPES } from "@astlide/core/utils/pptx-assets";
import type { APIRoute, GetStaticPaths } from "astro";

declare const __ASTLIDE_PPTX_ASSETS__: string;

const NAME = /^[0-9a-f]{24}\.[a-z0-9]+$/;

export const getStaticPaths: GetStaticPaths = async () => {
	const files = await readdir(__ASTLIDE_PPTX_ASSETS__).catch(() => [] as string[]);
	return files.filter((f) => NAME.test(f)).map((file) => ({ params: { file } }));
};

export const GET: APIRoute = async ({ params }) => {
	const file = params.file ?? "";
	if (!NAME.test(file)) return new Response("not found", { status: 404 });
	try {
		const data = await readFile(join(__ASTLIDE_PPTX_ASSETS__, file));
		return new Response(data, {
			headers: {
				"content-type": PPTX_ASSET_TYPES[extname(file)] ?? "application/octet-stream",
				"cache-control": "public, max-age=31536000, immutable",
			},
		});
	} catch {
		return new Response("not found", { status: 404 });
	}
};
