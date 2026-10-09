/**
 * PPTX export of a deck straight from its slide sources (no server needed).
 * Shared by `astlide export --pptx` and the `astlide-export-pptx` command.
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildSlide } from "./hast-builder";
import { parseMdxFile } from "./mdx-parser";
import { PptxFile } from "./ooxml-writer";
import { getTheme } from "./theme-map";

export interface PptxOptions {
	/** Project root (where src/content/decks lives). */
	cwd: string;
	/** Output .pptx path (default: <cwd>/dist/<deck>.pptx). */
	output?: string;
}

// ---------------------------------------------------------------------------
// Deck discovery
// ---------------------------------------------------------------------------

export async function getDecks(cwd: string): Promise<string[]> {
	const decksDir = join(cwd, "src", "content", "decks");
	const entries = await readdir(decksDir, { withFileTypes: true });
	return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function getMdxFiles(deckDir: string): Promise<string[]> {
	const entries = await readdir(deckDir, { withFileTypes: true });
	return entries
		.filter((e) => e.isFile() && e.name.endsWith(".mdx") && !e.name.startsWith("_"))
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((e) => join(deckDir, e.name));
}

async function readDeckConfig(cwd: string, deckName: string): Promise<Record<string, unknown>> {
	const configPath = join(cwd, "src", "content", "decks", deckName, "_config.json");
	if (!existsSync(configPath)) return { title: deckName };
	try {
		return JSON.parse(await readFile(configPath, "utf-8")) as Record<string, unknown>;
	} catch {
		return { title: deckName };
	}
}

// ---------------------------------------------------------------------------
// Per-deck export
// ---------------------------------------------------------------------------

export async function exportDeck(deckName: string, options: PptxOptions): Promise<void> {
	const { cwd } = options;
	const deckDir = join(cwd, "src", "content", "decks", deckName);
	// Resolve relative output paths against cwd so `--output ../../foo.pptx` becomes explicit
	const rawOutput = options.output ?? join(cwd, "dist", `${deckName}.pptx`);
	const outputPath = resolve(cwd, rawOutput);

	const [mdxFiles, deckConfig] = await Promise.all([
		getMdxFiles(deckDir),
		readDeckConfig(cwd, deckName),
	]);

	if (mdxFiles.length === 0) {
		console.warn(`  ⚠ No MDX files found in ${deckDir}`);
		return;
	}

	const theme = getTheme(deckConfig.theme as string | undefined);
	const pptx = new PptxFile({
		title: String(deckConfig.title ?? deckName),
		author: String(deckConfig.author ?? ""),
		theme,
	});

	for (let i = 0; i < mdxFiles.length; i++) {
		process.stdout.write(`  Slide ${i + 1}/${mdxFiles.length}\r`);

		try {
			const parsed = await parseMdxFile(mdxFiles[i]);

			// Skip hidden slides
			if (parsed.frontmatter.hidden === true) continue;

			const spec = buildSlide(parsed, deckConfig);
			pptx.addSlide(spec);
		} catch (err) {
			console.warn(`\n  ⚠ Error processing ${mdxFiles[i]}: ${err}`);
			// Add a blank error slide so slide numbering is preserved
			pptx.addSlide({
				background: "FFFFFF",
				elements: [
					{
						type: "textbox",
						runs: [
							{
								text: `[Error rendering: ${(err as Error).message ?? String(err)}]`,
								options: { fontSize: 18, color: "CC0000" },
							},
						],
						x: 0.5,
						y: 2,
						w: 9,
						h: 1.5,
						align: "center",
					},
				],
			});
		}
	}

	console.log("");
	await mkdir(dirname(outputPath), { recursive: true });

	await pptx.save(outputPath);
	console.log(`  ✓ Saved to ${outputPath}`);
}
