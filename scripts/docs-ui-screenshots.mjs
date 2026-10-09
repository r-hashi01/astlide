#!/usr/bin/env node
/**
 * Capture UI screenshots for the docs tutorial (presenter window, overview,
 * go-to dialog, pen) from the playground `tour` deck.
 *
 * Usage (with a dev / preview server running):
 *   node scripts/docs-ui-screenshots.mjs http://localhost:4321 docs/src/assets/tutorial
 */

import { chromium } from "playwright";

const [base, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: 1600, height: 900 },
	deviceScaleFactor: 1,
});
const wait = (ms) => page.waitForTimeout(ms);
const key = (k) => page.keyboard.press(k);

// Presenter window on the fragments slide, two steps in.
await page.goto(`${base}/tour/14?presenter`, { waitUntil: "networkidle" });
await wait(1500);
await key("ArrowRight");
await key("ArrowRight");
await wait(800);
await page.screenshot({ path: `${out}/presenter.png` });

// Overview grid.
await page.goto(`${base}/tour/1`, { waitUntil: "networkidle" });
await wait(1200);
await key("o");
await wait(6000);
await page.screenshot({ path: `${out}/overview.png` });
await key("Escape");

// Go-to dialog.
await page.goto(`${base}/tour/6`, { waitUntil: "networkidle" });
await wait(1200);
await key("g");
await page.keyboard.type("code");
await wait(400);
await page.screenshot({ path: `${out}/goto.png` });
await key("Escape");

// Pen: draw a circle around the diagram.
await page.goto(`${base}/tour/17`, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelector("pre.astlide-mermaid svg"));
await wait(800);
await key("d");
const box = await page.locator("#draw-layer").boundingBox();
const cx = box.x + box.width * 0.5,
	cy = box.y + box.height * 0.5,
	r = box.height * 0.28;
await page.mouse.move(cx + r * 1.5, cy);
await page.mouse.down();
for (let a = 0; a <= Math.PI * 2.1; a += 0.08)
	await page.mouse.move(cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r, { steps: 2 });
await page.mouse.up();
await wait(300);
await page.screenshot({ path: `${out}/pen.png` });
await browser.close();
