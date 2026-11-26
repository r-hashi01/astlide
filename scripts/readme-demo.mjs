#!/usr/bin/env node
/**
 * Record the animated demo at the top of the README from the playground decks:
 * a few `tour` slides, a deck themed by a PowerPoint template, the presenter
 * window and the overview.
 *
 * Usage (with a dev / preview server running):
 *   node scripts/readme-demo.mjs http://localhost:4321 .github/assets/demo.gif
 */

import { chromium } from "playwright";
import sharp from "sharp";

const [base, out] = process.argv.slice(2);
const WIDTH = 1280;
const HEIGHT = 720;
const OUT_WIDTH = 960;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
const wait = (ms) => page.waitForTimeout(ms);
const key = (k) => page.keyboard.press(k);

/** @type {{ png: Buffer, ms: number }[]} */
const frames = [];
const shot = async (ms) => frames.push({ png: await page.screenshot(), ms });
const open = async (path) => {
	await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
	await wait(800);
};

await open("/tour/1");
await shot(1800);
await open("/tour/9");
await shot(1600);
await open("/tour/11");
await shot(1600);

// Fragments, step by step.
await open("/tour/16");
await key("ArrowRight");
await wait(500);
await shot(700);
for (let i = 0; i < 2; i++) {
	await key("ArrowRight");
	await wait(500);
	await shot(i === 1 ? 1400 : 700);
}

await open("/tour/17");
await shot(1600);
await open("/tour/19");
await page.waitForFunction(() => document.querySelector("pre.astlide-mermaid svg"));
await wait(400);
await shot(1600);

// Markdown slides in a PowerPoint template's layouts, fonts and colors.
await open("/from-template/1");
await shot(1800);
await open("/from-template/3");
await shot(1400);
await open("/from-template/4");
await shot(1800);

await open("/tour/16?presenter");
await key("ArrowRight");
await key("ArrowRight");
await wait(600);
await shot(2400);

await open("/tour/1");
await key("o");
await wait(4000);
await shot(2400);

await browser.close();

const resized = await Promise.all(
	frames.map((f) => sharp(f.png).resize({ width: OUT_WIDTH }).png().toBuffer()),
);
await sharp(resized, { join: { animated: true } })
	.gif({ delay: frames.map((f) => f.ms), loop: 0, effort: 10 })
	.toFile(out);
console.log(`${out}: ${frames.length} frames`);
