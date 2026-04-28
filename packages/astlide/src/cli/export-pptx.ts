/**
 * astlide-export-pptx — MDX → HAST → OOXML PPTX exporter.
 *
 * Reads MDX slide files directly from disk (no Astro dev server required),
 * parses each file through the unified pipeline (remark-parse → remark-mdx →
 * remark-rehype → HAST), builds SlideSpec via hast-builder, and writes a
 * PowerPoint file using the self-contained OOXML writer.
 *
 * No browser, Playwright, or pptxgenjs dependency required.
 *
 * Usage:
 *   astlide-export-pptx --deck <name> [options]
 *   astlide-export-pptx --all [options]
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildSlide } from "./pptx/hast-builder";
import { parseMdxFile } from "./pptx/mdx-parser";
import { PptxFile } from "./pptx/ooxml-writer";
import { getTheme } from "./pptx/theme-map";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface ExportOptions {
	deck?: string;
	all?: boolean;
	output?: string;
	cwd: string;
}

function showHelp(): void {
	console.log(`
astlide export-pptx — Export slides to PowerPoint (.pptx)

Usage:
  astlide-export-pptx --deck <name> [options]
  astlide-export-pptx --all [options]

Options:
  -d, --deck <name>     Export a specific deck
  -a, --all             Export all decks
  -o, --output <path>   Output path (default: ./dist/<deck>.pptx)
  --cwd <path>          Project root (default: process.cwd())
  -h, --help            Show this help message

Examples:
  astlide-export-pptx --deck my-talk
  astlide-export-pptx --all
  astlide-export-pptx --deck my-talk --output ./slides/my-talk.pptx
`);
}

function parseArgs(): ExportOptions | null {
	const args = process.argv.slice(2);
	const options: ExportOptions = { cwd: process.cwd() };

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case "--deck":
			case "-d":
				if (i + 1 >= args.length) {
					console.error("Error: --deck requires a value");
					return null;
				}
				options.deck = args[++i];
				break;
			case "--all":
			case "-a":
				options.all = true;
				break;
			case "--output":
			case "-o":
				if (i + 1 >= args.length) {
					console.error("Error: --output requires a value");
					return null;
				}
				options.output = args[++i];
				break;
			case "--cwd":
				if (i + 1 >= args.length) {
					console.error("Error: --cwd requires a value");
					return null;
				}
				// Resolve to absolute path to prevent directory traversal via relative paths
				options.cwd = resolve(args[++i]);
				break;
			case "--help":
			case "-h":
				showHelp();
				return null;
			default:
				console.error(`Unknown option: ${arg}`);
				showHelp();
				return null;
		}
	}

	return options;
}

// ---------------------------------------------------------------------------
// Deck discovery
// ---------------------------------------------------------------------------

async function getDecks(cwd: string): Promise<string[]> {
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

async function exportDeck(deckName: string, options: ExportOptions): Promise<void> {
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

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const options = parseArgs();
	if (!options) return;

	if (!options.deck && !options.all) {
		console.error("Error: specify --deck <name> or --all");
		showHelp();
		process.exit(1);
	}

	console.log("Astlide PPTX Export");
	console.log("===================");

	const decks = options.all ? await getDecks(options.cwd) : [options.deck!];

	for (const deck of decks) {
		console.log(`\nExporting: ${deck}`);
		await exportDeck(deck, options);
	}

	console.log("\n✓ Export complete");
}

main().catch((err) => {
	console.error("Export failed:", err);
	process.exit(1);
});
