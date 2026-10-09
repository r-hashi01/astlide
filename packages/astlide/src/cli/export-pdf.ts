#!/usr/bin/env bun
import { exportDeck, getDecks } from "./render";

interface ExportOptions {
	deck?: string;
	all?: boolean;
	output?: string;
	format?: "pdf" | "png";
	baseUrl: string;
	width: number;
	height: number;
}

function showHelp(): void {
	console.log(`
astlide export — Export slides to PDF or PNG

Usage:
  astlide-export --deck <name> [options]
  astlide-export --all [options]

Options:
  -d, --deck <name>     Export a specific deck
  -a, --all             Export all decks
  -o, --output <path>   Output path (default: ./dist/<deck>.pdf or ./dist/<deck>-slides/)
  -f, --format <type>   Output format: pdf or png (default: pdf)
  --base-url <url>      Dev server URL (default: http://localhost:4321)
  --width <px>          Slide width in pixels (default: 1920)
  --height <px>         Slide height in pixels (default: 1080)
  -h, --help            Show this help message

Examples:
  astlide-export --deck my-talk
  astlide-export --all --format png
  astlide-export --deck my-talk --base-url http://localhost:3000
  astlide-export --deck my-talk --width 1280 --height 720
`);
}

function parseArgs(): ExportOptions | null {
	const args = process.argv.slice(2);
	const options: ExportOptions = {
		format: "pdf",
		baseUrl: "http://localhost:4321",
		width: 1920,
		height: 1080,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case "--deck":
			case "-d":
				options.deck = args[++i];
				break;
			case "--all":
			case "-a":
				options.all = true;
				break;
			case "--output":
			case "-o":
				options.output = args[++i];
				break;
			case "--format":
			case "-f":
				options.format = args[++i] as "pdf" | "png";
				break;
			case "--base-url":
				options.baseUrl = args[++i];
				break;
			case "--width": {
				if (i + 1 >= args.length) {
					console.error("Error: --width requires a value");
					return null;
				}
				const w = parseInt(args[++i], 10);
				if (Number.isNaN(w) || w <= 0) {
					console.error("Error: --width must be a positive integer");
					return null;
				}
				options.width = w;
				break;
			}
			case "--height": {
				if (i + 1 >= args.length) {
					console.error("Error: --height requires a value");
					return null;
				}
				const h = parseInt(args[++i], 10);
				if (Number.isNaN(h) || h <= 0) {
					console.error("Error: --height must be a positive integer");
					return null;
				}
				options.height = h;
				break;
			}
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

async function main(): Promise<void> {
	const options = parseArgs();
	if (!options) return;

	if (!options.deck && !options.all) {
		console.error("Error: specify --deck <name> or --all");
		showHelp();
		process.exit(1);
	}

	console.log("Astlide Export");
	console.log("==============");
	console.log(`Format: ${options.format} | Viewport: ${options.width}×${options.height}`);
	console.log(`Make sure your dev server is running at ${options.baseUrl}\n`);

	const decks = options.all ? await getDecks() : [options.deck!];
	for (const deck of decks) {
		await exportDeck(deck, options);
	}

	console.log("\n✓ Export complete");
}

main().catch((err) => {
	console.error("Export failed:", err);
	process.exit(1);
});
