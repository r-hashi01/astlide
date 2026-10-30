/**
 * Presenting in a real browser: the keyboard drives slides, steps and the
 * dialogs (these live in DeckLayout's client script, which unit tests can't
 * reach).
 */

import type { Page } from "playwright";
import { describe, expect, it } from "vitest";
import { open, useBrowser } from "./helpers/browser";

const browser = useBrowser();

const slideOf = (page: Page) => Number(new URL(page.url()).pathname.match(/\/(\d+)\/?$/)?.[1]);

async function deck(n: number): Promise<Page> {
	const page = await open(browser(), `/example-deck/${n}/`);
	await page.waitForSelector(".slide");
	return page;
}

describe("keyboard", () => {
	it("→ / ← move between slides", async () => {
		const page = await deck(1);
		await page.keyboard.press("ArrowRight");
		await expect.poll(() => slideOf(page)).toBe(2);
		await page.keyboard.press("ArrowRight");
		await expect.poll(() => slideOf(page)).toBe(3);
		await page.keyboard.press("ArrowLeft");
		await expect.poll(() => slideOf(page)).toBe(2);
	});

	it("→ reveals a slide's steps before moving on", async () => {
		const page = await deck(5); // Fragments — Step-by-Step Reveals
		const shown = () =>
			page.locator(".slide [data-fragment][data-fragment-visible='true']").count();
		const before = await shown();
		await page.keyboard.press("ArrowRight");
		await expect.poll(shown).toBeGreaterThan(before);
		expect(slideOf(page)).toBe(5);
		// Every step, then the next slide.
		for (let i = 0; i < 20 && slideOf(page) === 5; i++) {
			await page.keyboard.press("ArrowRight");
			await page.waitForTimeout(50);
		}
		await expect.poll(() => slideOf(page)).toBe(6);
	});

	it("o opens the overview of every slide; Escape closes it", async () => {
		const page = await deck(2);
		const overview = page.locator("#overview");
		await page.keyboard.press("o");
		await expect.poll(() => overview.getAttribute("aria-hidden")).toBe("false");
		expect(await page.locator("#overview-grid > *").count()).toBe(11);
		await page.keyboard.press("Escape");
		await expect.poll(() => overview.getAttribute("aria-hidden")).toBe("true");
	});

	it("g jumps to the slide typed", async () => {
		const page = await deck(1);
		await page.keyboard.press("g");
		await expect.poll(() => page.locator("#goto").getAttribute("aria-hidden")).toBe("false");
		await page.keyboard.type("4");
		await page.keyboard.press("Enter");
		await expect.poll(() => slideOf(page)).toBe(4);
	});

	it("n toggles the speaker notes", async () => {
		const page = await deck(2);
		const notes = page.locator("#notes-overlay");
		await page.keyboard.press("n");
		await expect.poll(() => notes.evaluate((el) => el.classList.contains("open"))).toBe(true);
		await page.keyboard.press("n");
		await expect.poll(() => notes.evaluate((el) => el.classList.contains("open"))).toBe(false);
	});

	it("keeps the closed notes out of the Tab order", async () => {
		const page = await deck(2);
		const notesClose = page.locator("#notes-close");
		const tabTo = async () => {
			for (let i = 0; i < 25; i++) {
				await page.keyboard.press("Tab");
				if (await notesClose.evaluate((el) => el === document.activeElement)) return true;
			}
			return false;
		};
		expect(await tabTo()).toBe(false);
		await page.keyboard.press("Escape");
		await page.locator("#slide-scaler").focus();
		await page.keyboard.press("n");
		await expect.poll(() => notesClose.isVisible()).toBe(true);
		expect(await tabTo()).toBe(true);
	});

	// Whether focus is on the page behind an open dialog (body means the browser's own UI).
	const focusBehind = (page: Page, dialog: string) =>
		page.evaluate((dialog) => {
			const el = document.activeElement;
			return !!el && el !== document.body && !el.closest(dialog);
		}, dialog);

	it("keeps focus in the overview while it's open, and gives it back", async () => {
		const page = await deck(2);
		const toolbarButton = page.locator('.slide-nav [data-action="overview"]');
		await toolbarButton.focus();
		await page.keyboard.press("Enter");
		await expect.poll(() => page.locator("#overview").getAttribute("aria-hidden")).toBe("false");
		const focusedLabel = () =>
			page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
		await expect.poll(focusedLabel).toBe("Slide 2 of 11 (current)");
		for (let i = 0; i < 30; i++) {
			await page.keyboard.press("Tab");
			expect(await focusBehind(page, "#overview")).toBe(false);
		}
		await page.keyboard.press("Escape");
		await expect.poll(() => page.locator("#overview").getAttribute("aria-hidden")).toBe("true");
		await expect
			.poll(() => toolbarButton.evaluate((el) => el === document.activeElement))
			.toBe(true);
		expect(await page.locator(".slide-nav").evaluate((el) => (el as HTMLElement).inert)).toBe(
			false,
		);
	});

	it("keeps focus in the go-to dialog while it's open", async () => {
		const page = await deck(2);
		await page.keyboard.press("g");
		await expect.poll(() => page.locator("#goto").getAttribute("aria-hidden")).toBe("false");
		for (let i = 0; i < 10; i++) {
			await page.keyboard.press("Tab");
			expect(await focusBehind(page, "#goto")).toBe(false);
		}
		await page.keyboard.press("Escape");
		await expect.poll(() => page.locator("#goto").getAttribute("aria-hidden")).toBe("true");
		expect(await page.locator(".slide-nav").evaluate((el) => (el as HTMLElement).inert)).toBe(
			false,
		);
	});
});
