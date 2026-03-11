import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright";

interface ExportOptions {
	deck?: string;
	all?: boolean;
	output?: string;
	format?: "pdf" | "png";
	baseUrl?: string;
}

async function parseArgs(): Promise<ExportOptions> {
	const args = process.argv.slice(2);
	const options: ExportOptions = {
		format: "pdf",
		baseUrl: "http://localhost:4321",
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--deck" || arg === "-d") {
			options.deck = args[++i];
		} else if (arg === "--all" || arg === "-a") {
			options.all = true;
		} else if (arg === "--output" || arg === "-o") {
			options.output = args[++i];
		} else if (arg === "--format" || arg === "-f") {
			options.format = args[++i] as "pdf" | "png";
		} else if (arg === "--base-url") {
			options.baseUrl = args[++i];
		}
	}

	return options;
}

async function getDecks(): Promise<string[]> {
	const entries = await readdir("src/content/decks", { withFileTypes: true });
	return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function getSlideCount(baseUrl: string, deck: string): Promise<number> {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.goto(`${baseUrl}/${deck}/1`);
	await page.waitForLoadState("networkidle");
	const count = await page.evaluate(() =>
		parseInt((document.body as HTMLElement).dataset.totalSlides || "0", 10),
	);
	await browser.close();
	return count;
}

async function exportToPDF(
	deck: string,
	slideCount: number,
	outputPath: string,
	baseUrl: string,
): Promise<void> {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.setViewportSize({ width: 1920, height: 1080 });

	const merged = await PDFDocument.create();

	for (let i = 1; i <= slideCount; i++) {
		process.stdout.write(`  Slide ${i}/${slideCount}\r`);

		await page.goto(`${baseUrl}/${deck}/${i}`);
		await page.waitForLoadState("networkidle");
		await page.waitForFunction(() => document.fonts.ready);

		// Hide navigation UI, reset scaling for clean print
		await page.addStyleTag({
			content: `
        .slide-nav, .progress-bar, .overview, .notes-overlay { display: none !important; }
        .presentation { background: transparent !important; }
        .slide-scaler { transform: none !important; width: auto !important; height: auto !important; }
      `,
		});

		const pdfBytes = await page.pdf({
			width: "1920px",
			height: "1080px",
			printBackground: true,
			margin: { top: 0, right: 0, bottom: 0, left: 0 },
		});

		// Import this page into the merged document
		const singleDoc = await PDFDocument.load(pdfBytes);
		const [importedPage] = await merged.copyPages(singleDoc, [0]);
		merged.addPage(importedPage);
	}

	console.log("");
	await browser.close();

	await mkdir(dirname(outputPath), { recursive: true });
	const finalBytes = await merged.save();
	await writeFile(outputPath, finalBytes);
}

async function exportToPNG(
	deck: string,
	slideCount: number,
	outputDir: string,
	baseUrl: string,
): Promise<void> {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.setViewportSize({ width: 1920, height: 1080 });

	await mkdir(outputDir, { recursive: true });

	for (let i = 1; i <= slideCount; i++) {
		process.stdout.write(`  Slide ${i}/${slideCount}\r`);

		await page.goto(`${baseUrl}/${deck}/${i}`);
		await page.waitForLoadState("networkidle");
		await page.waitForFunction(() => document.fonts.ready);

		await page.addStyleTag({
			content: `
        .slide-nav, .progress-bar, .overview, .notes-overlay { display: none !important; }
        .presentation { background: transparent !important; }
        .slide-scaler { transform: none !important; width: auto !important; height: auto !important; }
      `,
		});

		const slideElement = await page.$(".slide");
		if (slideElement) {
			await slideElement.screenshot({
				path: join(outputDir, `slide-${String(i).padStart(3, "0")}.png`),
				type: "png",
			});
		}
	}

	console.log("");
	await browser.close();
}

async function exportDeck(deck: string, options: ExportOptions): Promise<void> {
	console.log(`\nExporting: ${deck}`);
	const baseUrl = options.baseUrl!;

	const slideCount = await getSlideCount(baseUrl, deck);
	console.log(`  ${slideCount} slides found`);

	if (options.format === "png") {
		const outputDir = options.output || `./dist/${deck}-slides`;
		await exportToPNG(deck, slideCount, outputDir, baseUrl);
		console.log(`  ✓ Saved to ${outputDir}/`);
	} else {
		const outputPath = options.output || `./dist/${deck}.pdf`;
		await exportToPDF(deck, slideCount, outputPath, baseUrl);
		console.log(`  ✓ Saved to ${outputPath}`);
	}
}

async function main(): Promise<void> {
	const options = await parseArgs();

	if (!options.deck && !options.all) {
		console.error("Error: specify --deck <name> or --all");
		process.exit(1);
	}

	console.log("Astlide Export");
	console.log("==============");
	console.log("Make sure `npm run preview` (or `npm run dev`) is running.\n");

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
