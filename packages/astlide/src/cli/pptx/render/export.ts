/**
 * Render-based PPTX export: the deck's print view (`/<deck>/all`) is rendered
 * in Chromium, its text measured where the browser laid it out, and each slide
 * becomes a picture of everything but the text (backgrounds, boxes, code
 * blocks, diagrams, images) with editable text boxes placed on top.
 *
 * @module
 */

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";
import { PptxFile, type SlideElement, type TextRunOptions } from "../ooxml-writer";
import { getTheme } from "../theme-map";
import { type MeasuredRun, type MeasuredSlide, measureSlides } from "./measure";

export interface RenderPptxOptions {
	/** Site URL including Astro's base. */
	baseUrl: string;
	output: string;
	title?: string;
	author?: string;
	theme?: string;
}

/** Slide width in inches (16:9, 10 × 5.625 in — the writer's slide size). */
const SLIDE_W_IN = 10;

/** Hide measured text (and nothing else) for the background raster. */
const HIDE_TEXT_CSS = `
[data-astlide-measured] {
	color: transparent !important;
	text-shadow: none !important;
	text-decoration-color: transparent !important;
}
/* Only color, not -webkit-text-fill-color: ::marker can't override the latter. */
[data-astlide-measured]::marker {
	color: var(--astlide-measured-color) !important;
}
`;

/** Map web font stacks to fonts PowerPoint is likely to have. */
function fontFace(family: string): string {
	const f = family.toLowerCase();
	if (/mono|consol|courier|menlo|sf ?mono/.test(f)) return "Consolas";
	if (f === "system-ui" || f === "-apple-system" || f === "sans-serif" || f === "") return "Arial";
	if (f === "serif") return "Times New Roman";
	return family;
}

function runToElement(run: MeasuredRun, pxToIn: number): SlideElement {
	const ptPerPx = pxToIn * 72;
	const options: TextRunOptions = {
		fontSize: run.fontSize * ptPerPx,
		color: run.color.slice(1).toUpperCase(),
		fontFace: fontFace(run.fontFamily),
		bold: run.fontWeight >= 600,
		italic: run.italic,
		letterSpacing: run.letterSpacing ? run.letterSpacing * ptPerPx : undefined,
	};
	return {
		type: "textbox",
		runs: [{ text: run.text, options }],
		x: run.x * pxToIn,
		y: run.y * pxToIn,
		// Room for PowerPoint's slightly different glyph widths; text doesn't wrap.
		w: run.w * pxToIn * 1.15 + 0.05,
		h: run.h * pxToIn,
		valign: "middle",
		wrap: false,
		inset: 0,
	};
}

export async function exportRenderedPptx(deck: string, options: RenderPptxOptions): Promise<void> {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({
			viewport: { width: 1920, height: 1080 },
			deviceScaleFactor: 2,
		});
		await page.goto(`${options.baseUrl}/${deck}/all`);
		await page.waitForLoadState("networkidle");
		await page.evaluate(() => document.fonts.ready);
		await page.waitForFunction(
			() => document.documentElement.hasAttribute("data-diagrams-ready"),
			null,
			{
				timeout: 30_000,
			},
		);

		const measured: MeasuredSlide[] = await page.evaluate(measureSlides);
		await page.addStyleTag({ content: HIDE_TEXT_CSS });

		const pptx = new PptxFile({
			title: options.title ?? deck,
			author: options.author ?? "",
			theme: getTheme(options.theme),
		});
		const slides = page.locator("body > .slide");
		for (let i = 0; i < measured.length; i++) {
			process.stdout.write(`  Slide ${i + 1}/${measured.length}\r`);
			const m = measured[i] as MeasuredSlide;
			const pxToIn = SLIDE_W_IN / m.width;
			const png = await slides.nth(i).screenshot({ type: "png" });
			pptx.addSlide({
				background: m.background.slice(1).toUpperCase(),
				elements: [
					{
						type: "image",
						name: "Slide background",
						x: 0,
						y: 0,
						w: SLIDE_W_IN,
						h: m.height * pxToIn,
						png,
					},
					...m.runs.map((run) => runToElement(run, pxToIn)),
				],
			});
		}
		console.log("");
		await mkdir(dirname(options.output), { recursive: true });
		await pptx.save(options.output);
		console.log(`  ✓ Saved to ${options.output}`);
	} finally {
		await browser.close();
	}
}
