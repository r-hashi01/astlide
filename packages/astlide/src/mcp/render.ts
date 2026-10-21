/**
 * `render_deck`: export a deck to editable PowerPoint and / or PDF with the
 * project's `astlide export` (which builds the site first).
 *
 * @module
 */

import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { deckDir, projectRoot, runAstlide } from "./project";

export type RenderFormat = "pptx" | "pdf";

export interface RenderOptions {
	projectRoot: string;
	deck: string;
	formats: RenderFormat[];
	/** Where the files go, inside the project (default: `<projectRoot>/exports`). */
	outDir?: string;
	/** Build the site first (default true); false reuses `dist/`. */
	build?: boolean;
}

export interface RenderResult {
	/** Written files, by format. */
	files: Partial<Record<RenderFormat, string>>;
	/** The exporter's output (warnings such as fonts not found). */
	log: string;
}

/** The `astlide export` arguments for a render. */
export function exportArgs(options: RenderOptions, outDir: string): string[] {
	const formats = [...new Set(options.formats)];
	if (formats.length === 0) throw new Error("name at least one format: pptx or pdf");
	return [
		"export",
		options.deck,
		...formats.map((f) => `--${f}`),
		"--out-dir",
		outDir,
		...(options.build === false ? ["--no-build"] : []),
	];
}

/**
 * The output folder for a render: `outDir` resolved against the project
 * root, which it must stay inside — an agent can't write files elsewhere.
 */
export function outputDir(root: string, outDir = "exports"): string {
	const dir = resolve(root, outDir);
	const rel = relative(root, dir);
	if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
		throw new Error(`outDir must be inside the project (${root}), not ${dir}`);
	return dir;
}

export async function renderDeck(options: RenderOptions): Promise<RenderResult> {
	const root = projectRoot(options.projectRoot);
	deckDir(root, options.deck);
	const outDir = outputDir(root, options.outDir);
	const r = await runAstlide(root, exportArgs(options, outDir));
	const log = `${r.stdout}${r.stderr}`.trim();
	if (r.code !== 0) {
		const hint = /playwright|chromium|browserType/i.test(log)
			? "\nPDF needs Playwright's Chromium: run `bunx playwright install chromium` in the project."
			: "";
		throw new Error(`astlide export failed:\n${log}${hint}`);
	}
	const files: RenderResult["files"] = {};
	for (const f of new Set(options.formats)) {
		const file = join(outDir, `${options.deck}.${f}`);
		if (existsSync(file)) files[f] = file;
	}
	return { files, log };
}
