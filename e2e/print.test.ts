/**
 * Printing a deck from the browser (Save as PDF): every slide fits the paper
 * — not only the 1920×1080 page `@page` asks for, which Safari ignores — and
 * a slide change in flight doesn't end up on paper over the new slide.
 */

import type { Page } from "playwright";
import { describe, expect, inject, it } from "vitest";
import { useBrowser } from "./helpers/browser";

const browser = useBrowser();

/** Letter, landscape, at 96 dpi — what a browser lays a printed page out at. */
const LETTER = { width: 1056, height: 816 };

async function printed(path: string, viewport = LETTER): Promise<Page> {
	const page = await browser().newPage({ viewport });
	await page.goto(`${inject("baseUrl")}${path}`, { waitUntil: "networkidle" });
	await page.emulateMedia({ media: "print" });
	return page;
}

/** The first slide's box, and whether it lies within the page. */
async function slideBox(page: Page, viewport = LETTER) {
	const box = await page.locator(".slide").first().boundingBox();
	if (!box) throw new Error("no slide");
	return {
		...box,
		fits:
			box.x >= -1 &&
			box.y >= -1 &&
			box.x + box.width <= viewport.width + 1 &&
			box.y + box.height <= viewport.height + 1,
	};
}

describe("printing", () => {
	for (const path of ["/tour/1/", "/tour/1/?print", "/tour/all/"]) {
		it(`fits each slide on smaller paper (${path})`, async () => {
			const page = await printed(path);
			const box = await slideBox(page);
			expect(box.fits).toBe(true);
			// Scaled down to the page width, not shrunk to nothing.
			expect(box.width).toBeGreaterThan(LETTER.width * 0.95);
			// No horizontal overflow onto a second sheet.
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				LETTER.width,
			);
			await page.close();
		});
	}

	it("keeps slides at full size on 1920×1080 pages (astlide export)", async () => {
		const full = { width: 1920, height: 1080 };
		const page = await printed("/tour/all/", full);
		const box = await slideBox(page, full);
		expect([box.width, box.height]).toEqual([1920, 1080]);
		await page.close();
	});

	it("prints no slide transition in progress", async () => {
		const page = await browser().newPage({ viewport: { width: 1440, height: 900 } });
		await page.goto(`${inject("baseUrl")}/tour/2/`, { waitUntil: "networkidle" });
		await page.keyboard.press("ArrowLeft"); // back to slide 1, with its transition
		await page.waitForTimeout(40);
		await page.emulateMedia({ media: "print" });
		// Neither the View Transition's snapshots nor a slide's entrance animation run.
		expect(
			await page.evaluate(() =>
				document.getAnimations().map((a) => (a as CSSAnimation).animationName ?? a.id),
			),
		).toEqual([]);
		await page.close();
	});
});
