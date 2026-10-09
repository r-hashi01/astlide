#!/usr/bin/env bun
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

import { resolve } from "node:path";
import { exportDeck, getDecks } from "./pptx/export";

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
