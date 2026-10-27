/**
 * Presenter sync: windows of one deck follow each other over BroadcastChannel,
 * and ignore malformed messages on that channel.
 */

import type { Page } from "playwright";
import { describe, expect, inject, it } from "vitest";
import { useBrowser } from "./helpers/browser";

const browser = useBrowser();

const slideOf = (page: Page) => Number(new URL(page.url()).pathname.match(/\/(\d+)\/?$/)?.[1]);

describe("presenter sync", () => {
	it("moves the audience window with the presenter, and ignores bad messages", async () => {
		const context = await browser().newContext({ viewport: { width: 1920, height: 1080 } });
		const base = inject("baseUrl");
		const audience = await context.newPage();
		await audience.goto(`${base}/example-deck/1/`);
		await audience.waitForSelector(".slide");
		const presenter = await context.newPage();
		await presenter.goto(`${base}/example-deck/1/?presenter`);
		await presenter.waitForSelector(".slide");

		await presenter.keyboard.press("ArrowRight");
		await expect.poll(() => slideOf(audience)).toBe(2);
		await audience.waitForSelector(".slide");

		// Another page on the origin posting junk on the deck's channel (old and new name).
		const other = await context.newPage();
		await other.goto(`${base}/`);
		await other.evaluate(() => {
			for (const name of ["astlide-sync-/example-deck", "astlide-sync-example-deck"]) {
				const ch = new BroadcastChannel(name);
				for (const slide of ["../../evil/", "3", 0, 9999, 2.5, null])
					ch.postMessage({ type: "navigate", slide });
				ch.postMessage({ type: "step", slide: 2, step: "x" });
				ch.postMessage({
					type: "draw",
					slide: 2,
					stroke: { id: 1, color: "red", width: 6, points: "x" },
				});
				ch.close();
			}
		});
		await audience.waitForTimeout(500);
		expect(new URL(audience.url()).pathname).toMatch(/\/example-deck\/2\/?$/);

		// A well-formed message still works.
		await other.evaluate(() => {
			const ch = new BroadcastChannel("astlide-sync-/example-deck");
			ch.postMessage({ type: "navigate", slide: 3 });
			ch.close();
		});
		await expect.poll(() => slideOf(audience)).toBe(3);
		await context.close();
	});
});
