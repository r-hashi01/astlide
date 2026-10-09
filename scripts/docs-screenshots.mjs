#!/usr/bin/env node
/**
 * Capture slide screenshots for the docs (layout & theme galleries, tutorial).
 *
 * Renders from a deck's print view (`/<deck>/all`): every slide stacked in its
 * final state (all fragment / code steps applied), no transitions, diagrams
 * awaited — then screenshots each `.slide` element.
 *
 * Usage (with a dev / preview server running):
 *   node scripts/docs-screenshots.mjs --base-url http://localhost:4321 --deck tour \
 *     --out docs/src/assets/gallery [--slides 1,6,8] [--themes default,dark] \
 *     [--theme-slide 6] [--scale 0.5]
 *
 * Writes `<deck>-<n>.png` per slide and, with --themes, `theme-<name>.png`
 * (the --theme-slide slide rendered in each theme).
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values } = parseArgs({
	options: {
		"base-url": { type: "string", default: "http://localhost:4321" },
		deck: { type: "string" },
		out: { type: "string" },
		slides: { type: "string" },
		themes: { type: "string" },
		"theme-slide": { type: "string", default: "1" },
		scale: { type: "string", default: "0.5" },
	},
});

if (!values.deck || !values.out) {
	console.error("Usage: node scripts/docs-screenshots.mjs --deck <deck> --out <dir> [options]");
	process.exit(2);
}

const baseUrl = values["base-url"].replace(/\/+$/, "");
const scale = Number(values.scale);
mkdirSync(values.out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: 1920, height: 1080 },
	deviceScaleFactor: scale,
});

await page.goto(`${baseUrl}/${values.deck}/all`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => document.documentElement.hasAttribute("data-diagrams-ready"));

const slides = page.locator("body > .slide");
const count = await slides.count();
const wanted = values.slides
	? values.slides.split(",").map((n) => Number(n.trim()))
	: Array.from({ length: count }, (_, i) => i + 1);

for (const n of wanted) {
	if (n < 1 || n > count) throw new Error(`Slide ${n} out of range (1–${count})`);
	const file = join(values.out, `${values.deck}-${n}.png`);
	await slides.nth(n - 1).screenshot({ path: file });
	console.log(`  ${file}`);
}

if (values.themes) {
	const target = slides.nth(Number(values["theme-slide"]) - 1);
	for (const theme of values.themes.split(",").map((t) => t.trim())) {
		await page.evaluate((t) => {
			document.documentElement.dataset.theme = t;
		}, theme);
		const file = join(values.out, `theme-${theme}.png`);
		await target.screenshot({ path: file });
		console.log(`  ${file}`);
	}
}

await browser.close();
