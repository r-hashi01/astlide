import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { type Browser, chromium } from "playwright";

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

async function getDecks(): Promise<string[]> {
	const decksDir = join(process.cwd(), "src", "content", "decks");
	const entries = await readdir(decksDir, { withFileTypes: true });
	return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function getSlideCount(browser: Browser, baseUrl: string, deck: string): Promise<number> {
	const page = await browser.newPage();
	await page.goto(`${baseUrl}/${deck}/1`);
	await page.waitForLoadState("networkidle");
	const count = await page.evaluate(() =>
		parseInt((document.body as HTMLElement).dataset.totalSlides || "0", 10),
	);
	await page.close();
	return count;
}

const EXPORT_STYLE = `
	.slide-nav, .progress-bar, .overview, .notes-overlay { display: none !important; }
	.presentation { background: transparent !important; }
	.slide-scaler { transform: none !important; width: auto !important; height: auto !important; }
`;

async function exportToPDF(
	browser: Browser,
	deck: string,
	slideCount: number,
	outputPath: string,
	baseUrl: string,
	width: number,
	height: number,
): Promise<void> {
	const page = await browser.newPage();
	await page.setViewportSize({ width, height });

	const merged = await PDFDocument.create();

	for (let i = 1; i <= slideCount; i++) {
		process.stdout.write(`  Slide ${i}/${slideCount}\r`);

		await page.goto(`${baseUrl}/${deck}/${i}`);
		await page.waitForLoadState("networkidle");
		await page.waitForFunction(() => document.fonts.ready);

		await page.addStyleTag({ content: EXPORT_STYLE });

		const pdfBytes = await page.pdf({
			width: `${width}px`,
			height: `${height}px`,
			printBackground: true,
			margin: { top: 0, right: 0, bottom: 0, left: 0 },
		});

		const singleDoc = await PDFDocument.load(pdfBytes);
		const [importedPage] = await merged.copyPages(singleDoc, [0]);
		merged.addPage(importedPage);
	}

	console.log("");
	await page.close();

	await mkdir(dirname(outputPath), { recursive: true });
	const finalBytes = await merged.save();
	await writeFile(outputPath, finalBytes);
}

async function exportToPNG(
	browser: Browser,
	deck: string,
	slideCount: number,
	outputDir: string,
	baseUrl: string,
	width: number,
	height: number,
): Promise<void> {
	const page = await browser.newPage();
	await page.setViewportSize({ width, height });

	await mkdir(outputDir, { recursive: true });

	for (let i = 1; i <= slideCount; i++) {
		process.stdout.write(`  Slide ${i}/${slideCount}\r`);

		await page.goto(`${baseUrl}/${deck}/${i}`);
		await page.waitForLoadState("networkidle");
		await page.waitForFunction(() => document.fonts.ready);

		await page.addStyleTag({ content: EXPORT_STYLE });

		const slideElement = await page.$(".slide");
		if (slideElement) {
			await slideElement.screenshot({
				path: join(outputDir, `slide-${String(i).padStart(3, "0")}.png`),
				type: "png",
			});
		}
	}

	console.log("");
	await page.close();
}

async function exportDeck(deck: string, options: ExportOptions): Promise<void> {
	console.log(`\nExporting: ${deck}`);

	// Launch a single browser instance shared across slide-count detection and export
	const browser = await chromium.launch();
	try {
		const slideCount = await getSlideCount(browser, options.baseUrl, deck);
		console.log(`  ${slideCount} slides found`);

		if (options.format === "png") {
			const outputDir = options.output || `./dist/${deck}-slides`;
			await exportToPNG(
				browser,
				deck,
				slideCount,
				outputDir,
				options.baseUrl,
				options.width,
				options.height,
			);
			console.log(`  ✓ Saved to ${outputDir}/`);
		} else {
			const outputPath = options.output || `./dist/${deck}.pdf`;
			await exportToPDF(
				browser,
				deck,
				slideCount,
				outputPath,
				options.baseUrl,
				options.width,
				options.height,
			);
			console.log(`  ✓ Saved to ${outputPath}`);
		}
	} finally {
		await browser.close();
	}
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
