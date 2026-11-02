/**
 * `astlide export --pptx` in an Astlide project: build the site (into the
 * export's own folder, see utils/export-build), then make the PPTX from the
 * deck's print view.
 *
 * @module
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { exportSiteDir } from "@astlide/core/utils/export-build";
import { readDeckConfigFile } from "../deck/project";
import { pptxFromPrintView } from "../pptx/export/export";

export interface PptxOptions {
	/** Project root (built into the export's own folder, see utils/export-build). */
	root: string;
	output: string;
	/** Skip the build: use the export's last build, else the existing dist/. */
	build?: boolean;
}

export async function exportPptx(deck: string, options: PptxOptions): Promise<void> {
	if (options.build !== false) {
		const { buildSite } = await import("./site-server");
		await buildSite(options.root);
	}
	const site = exportSiteDir(options.root);
	if (!site.own)
		console.log('  (using dist/: speaker notes only if it was built with notes: "public")');
	const dist = site.dir;
	const html = join(dist, deck, "all", "index.html");
	if (!existsSync(html)) throw new Error(`no print view at ${html}`);
	await pptxFromPrintView({
		html,
		site: dist,
		root: options.root,
		deck,
		config: await readDeckConfigFile(options.root, deck),
		output: options.output,
	});
}
