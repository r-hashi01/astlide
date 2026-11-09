/**
 * The deck runtime's tools in a real browser: pen and laser (mirrored to the
 * other window), the toolbar's buttons, the presenter timer, the notes font
 * size, Home / End, Escape, share mode and swipes, and what a cleanup leaves behind.
 */

import type { BrowserContext, Page } from "playwright";
import { describe, expect, inject, it } from "vitest";
import { open, useBrowser } from "./helpers/browser";

const browser = useBrowser();

const slideOf = (page: Page) => Number(new URL(page.url()).pathname.match(/\/(\d+)\/?$/)?.[1]);

/** Two windows of one deck: they share the sync channel. */
async function pair(path: string): Promise<{ context: BrowserContext; a: Page; b: Page }> {
	const context = await browser().newContext({ viewport: { width: 1920, height: 1080 } });
	const pages: Page[] = [];
	for (let i = 0; i < 2; i++) {
		const page = await context.newPage();
		await page.goto(`${inject("baseUrl")}${path}`);
		await page.waitForSelector(".slide");
		pages.push(page);
	}
	// Each window starts without saved drawings.
	await pages[0].evaluate(() => localStorage.clear());
	return { context, a: pages[0], b: pages[1] };
}

/** The strokes a window holds for a slide. */
const strokes = (page: Page, key: string) =>
	page.evaluate(
		(k) =>
			(
				(window as unknown as { __astlide_drawings?: Record<string, { points: unknown[] }[]> })
					.__astlide_drawings?.[k] ?? []
			).map((s) => s.points.length),
		key,
	);

/** Drag across the drawing layer. */
async function drag(page: Page): Promise<void> {
	const box = await page.locator("#draw-layer").boundingBox();
	if (!box) throw new Error("no #draw-layer");
	await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
	await page.mouse.down();
	for (let i = 1; i <= 5; i++)
		await page.mouse.move(box.x + box.width * (0.3 + i * 0.05), box.y + box.height * 0.4);
	await page.mouse.up();
}

describe("pen and laser", () => {
	it("draws a stroke that the other window mirrors; c clears the slide, C the deck", async () => {
		const { context, a, b } = await pair("/example-deck/1/");
		await a.keyboard.press("d");
		expect(await a.evaluate(() => document.documentElement.dataset.tool)).toBe("draw");
		expect(await a.locator('.nav-btn[data-action="draw"]').getAttribute("aria-pressed")).toBe(
			"true",
		);

		await drag(a);
		const drawn = await strokes(a, "example-deck/1");
		expect(drawn).toHaveLength(1);
		expect(drawn[0]).toBeGreaterThan(1);
		await expect.poll(() => strokes(b, "example-deck/1")).toEqual(drawn);
		// `drawings.persist`: saved for the deck, shortly after the stroke ends.
		await expect
			.poll(() => a.evaluate(() => localStorage.getItem("astlide:drawings:/example-deck")))
			.toContain('"example-deck/1"');

		await a.keyboard.press("c");
		expect(await strokes(a, "example-deck/1")).toEqual([]);
		await expect.poll(() => strokes(b, "example-deck/1")).toEqual([]);

		await drag(a);
		await a.evaluate(() => {
			const w = window as unknown as { __astlide_drawings: Record<string, unknown[]> };
			w.__astlide_drawings["example-deck/5"] = [
				{ id: "x", color: "red", width: 6, points: [[1, 1]] },
			];
		});
		await a.keyboard.press("Shift+C");
		expect(await strokes(a, "example-deck/1")).toEqual([]);
		expect(await strokes(a, "example-deck/5")).toEqual([]);
		await expect.poll(() => strokes(b, "example-deck/1")).toEqual([]);

		// d again: the pen is put away.
		await a.keyboard.press("d");
		expect(await a.evaluate(() => document.documentElement.dataset.tool)).toBeUndefined();
		await context.close();
	});

	it("shows the laser in the other window, and hides it when the tool is put away", async () => {
		const { context, a, b } = await pair("/example-deck/1/");
		await a.keyboard.press("l");
		const box = await a.locator("#draw-layer").boundingBox();
		if (!box) throw new Error("no #draw-layer");
		await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await a.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2);
		await expect.poll(() => b.locator("#laser-dot").isHidden()).toBe(false);
		await a.keyboard.press("Escape");
		expect(await a.evaluate(() => document.documentElement.dataset.tool)).toBeUndefined();
		await expect.poll(() => b.locator("#laser-dot").isHidden()).toBe(true);
		await context.close();
	});
});

describe("keys", () => {
	it("Escape puts the tool away first, then closes the notes", async () => {
		const page = await open(browser(), "/example-deck/1/");
		await page.waitForSelector(".slide");
		await page.keyboard.press("n");
		await page.keyboard.press("d");
		await page.keyboard.press("Escape");
		expect(await page.evaluate(() => document.documentElement.dataset.tool)).toBeUndefined();
		expect(await page.locator("#notes-overlay").getAttribute("aria-hidden")).toBe("false");
		await page.keyboard.press("Escape");
		expect(await page.locator("#notes-overlay").getAttribute("aria-hidden")).toBe("true");
		await page.close();
	});

	it("End / ↓ go to the last slide, Home / ↑ to the first", async () => {
		const page = await open(browser(), "/example-deck/3/");
		await page.waitForSelector(".slide");
		await page.keyboard.press("End");
		await expect.poll(() => slideOf(page)).toBe(11);
		await page.waitForSelector(".slide");
		await page.keyboard.press("ArrowUp");
		await expect.poll(() => slideOf(page)).toBe(1);
		await page.waitForSelector(".slide");
		await page.keyboard.press("ArrowDown");
		await expect.poll(() => slideOf(page)).toBe(11);
		await page.waitForSelector(".slide");
		await page.keyboard.press("Home");
		await expect.poll(() => slideOf(page)).toBe(1);
		await page.close();
	});

	it("share mode stays on while moving between slides, and s turns it off", async () => {
		const page = await open(browser(), "/example-deck/3/");
		await page.waitForSelector(".slide");
		const share = () => page.evaluate(() => document.documentElement.hasAttribute("data-share"));
		await page.keyboard.press("s");
		await expect.poll(share).toBe(true);
		await page.waitForSelector(".slide");
		await page.keyboard.press("ArrowRight");
		await expect.poll(() => slideOf(page)).toBe(4);
		expect(new URL(page.url()).searchParams.has("share")).toBe(true);
		expect(await share()).toBe(true);
		await page.waitForSelector(".slide");
		await page.keyboard.press("s");
		await expect.poll(share).toBe(false);
		await page.waitForSelector(".slide");
		await page.keyboard.press("ArrowRight");
		await expect.poll(() => slideOf(page)).toBe(5);
		expect(new URL(page.url()).searchParams.has("share")).toBe(false);
		await page.close();
	});

	it("Shift+. / Shift+, change the notes font size, and the size is kept", async () => {
		const page = await open(browser(), "/example-deck/1/?presenter");
		await page.waitForSelector(".slide");
		await page.evaluate(() => localStorage.removeItem("astlide:notes-font-size"));
		// In rem; sums of 0.1 steps aren't exact.
		const size = async () =>
			Number.parseFloat(
				await page.evaluate(() =>
					document.documentElement.style.getPropertyValue("--astlide-notes-font-size"),
				),
			).toFixed(2);
		await page.keyboard.press("Shift+.");
		expect(await size()).toBe("1.10");
		await page.keyboard.press("Shift+.");
		await page.keyboard.press("Shift+,");
		expect(await size()).toBe("1.10");
		expect(await page.evaluate(() => localStorage.getItem("astlide:notes-font-size"))).toBe("1.1");
		await page.locator('[data-notes-font="inc"]').click();
		expect(await size()).toBe("1.20");
		await page.locator('[data-notes-font="reset"]').click();
		expect(await size()).toBe("1.00");
		await page.evaluate(() => localStorage.removeItem("astlide:notes-font-size"));
		await page.close();
	});
});

describe("toolbar", () => {
	it("opens the notes, the overview and the go-to dialog, and takes the pen", async () => {
		const page = await open(browser(), "/example-deck/1/");
		await page.waitForSelector(".slide");
		const button = (action: string) => page.locator(`.nav-btn[data-action="${action}"]`);
		// The toolbar takes clicks while the pointer is over the page.
		await page.mouse.move(960, 540);

		await button("notes").click();
		expect(await page.locator("#notes-overlay").getAttribute("aria-hidden")).toBe("false");
		await page.locator("#notes-close").click();
		expect(await page.locator("#notes-overlay").getAttribute("aria-hidden")).toBe("true");

		await button("overview").click();
		expect(await page.locator("#overview").getAttribute("aria-hidden")).toBe("false");
		await page.keyboard.press("Escape");
		expect(await page.locator("#overview").getAttribute("aria-hidden")).toBe("true");

		await button("goto").click();
		expect(await page.locator("#goto").getAttribute("aria-hidden")).toBe("false");
		await page.keyboard.press("Escape");
		expect(await page.locator("#goto").getAttribute("aria-hidden")).toBe("true");

		await button("laser").click();
		expect(await page.evaluate(() => document.documentElement.dataset.tool)).toBe("laser");
		await button("draw").click();
		expect(await page.evaluate(() => document.documentElement.dataset.tool)).toBe("draw");
		expect(await button("laser").getAttribute("aria-pressed")).toBe("false");
		await button("draw").click();
		expect(await page.evaluate(() => document.documentElement.dataset.tool)).toBeUndefined();

		await page.locator('a.nav-btn[aria-label="Next slide"]').click();
		await expect.poll(() => slideOf(page)).toBe(2);
		await page.close();
	});
});

describe("presenter timer", () => {
	it("starts, pauses and resets", async () => {
		const page = await open(browser(), "/example-deck/1/?presenter");
		await page.waitForSelector(".slide");
		const timer = page.locator("#presenter-timer");
		const start = page.locator("#timer-btn");
		await start.click();
		expect(await start.getAttribute("aria-label")).toBe("Pause timer");
		await expect.poll(() => timer.textContent(), { timeout: 5000 }).not.toBe("00:00");
		await start.click();
		expect(await start.getAttribute("aria-label")).toBe("Resume timer");
		const paused = await timer.textContent();
		await page.waitForTimeout(1200);
		expect(await timer.textContent()).toBe(paused);
		await page.locator("#timer-reset").click();
		expect(await timer.textContent()).toBe("00:00");
		expect(await start.getAttribute("aria-label")).toBe("Start timer");
		await page.close();
	});
});

describe("touch", () => {
	it("a swipe left moves on, a swipe right moves back, a tap does nothing", async () => {
		const page = await open(browser(), "/example-deck/2/");
		await page.waitForSelector(".slide");
		const swipe = (from: number, to: number) =>
			page.evaluate(
				([x0, x1]) => {
					const touch = (x: number) =>
						new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 500 });
					document.dispatchEvent(
						new TouchEvent("touchstart", { changedTouches: [touch(x0)], bubbles: true }),
					);
					document.dispatchEvent(
						new TouchEvent("touchend", { changedTouches: [touch(x1)], bubbles: true }),
					);
				},
				[from, to],
			);
		await swipe(1000, 990);
		await page.waitForTimeout(300);
		expect(slideOf(page)).toBe(2);
		await swipe(1000, 600);
		await expect.poll(() => slideOf(page)).toBe(3);
		await page.waitForSelector(".slide");
		await swipe(600, 1000);
		await expect.poll(() => slideOf(page)).toBe(2);
		await page.close();
	});
});

describe("cleanup", () => {
	it("stops the timer and leaves no listeners behind after moving between slides", async () => {
		const page = await open(browser(), "/example-deck/1/?presenter");
		await page.waitForSelector(".slide");
		const cdp = await page.context().newCDPSession(page);
		const listeners = async () => {
			const counts: number[] = [];
			for (const expression of ["document", "window"]) {
				const { result } = await cdp.send("Runtime.evaluate", { expression });
				if (!result.objectId) throw new Error(`no ${expression}`);
				const { listeners } = await cdp.send("DOMDebugger.getEventListeners", {
					objectId: result.objectId,
				});
				counts.push(listeners.length);
			}
			return counts;
		};
		const before = await listeners();
		for (const n of [2, 3]) {
			await page.keyboard.press("ArrowRight");
			await expect.poll(() => slideOf(page)).toBe(n);
			await page.waitForSelector(".slide");
		}
		expect(await listeners()).toEqual(before);

		// A cleanup stops a running timer.
		await page.locator("#timer-btn").click();
		await page.evaluate(() =>
			(window as unknown as { __astlide_cleanup(): void }).__astlide_cleanup(),
		);
		await page.waitForTimeout(1500);
		expect(await page.locator("#presenter-timer").textContent()).toBe("00:00");
		await page.close();
	});
});
