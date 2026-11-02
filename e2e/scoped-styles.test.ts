/**
 * Astlide's stylesheets on a page of the app that isn't a deck (Next.js and
 * Nuxt load them on every page): the reset, the element styles and the deck
 * page's `html, body` rules stay off it, and apply once the page has a deck.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { useBrowser } from "./helpers/browser";

const browser = useBrowser();
const css = ["base.css", "deck.css", "slide.css", "themes/default.css"]
	.map((f) => readFileSync(resolve("packages/astlide/src/styles", f), "utf-8"))
	.join("\n");

async function styles(body: string) {
	const page = await browser().newPage();
	await page.setContent(
		`<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`,
	);
	const result = await page.evaluate(() => {
		const h1 = getComputedStyle(document.querySelector("h1") as Element);
		const body = getComputedStyle(document.body);
		return { bodyMargin: body.margin, overflow: body.overflow, h1Weight: h1.fontWeight };
	});
	await page.close();
	return result;
}

describe("Astlide's styles on the app's other pages", () => {
	it("leave a page without a deck alone", async () => {
		expect(await styles("<h1>App</h1>")).toEqual({
			bodyMargin: "8px",
			overflow: "visible",
			h1Weight: "700",
		});
	});

	it("apply on a deck page", async () => {
		expect(await styles('<main class="presentation"><h1>Slide</h1></main>')).toEqual({
			bodyMargin: "0px",
			overflow: "hidden",
			h1Weight: "600",
		});
	});
});
