/**
 * A deck embedded in another page (<DeckEmbed> → <astlide-deck>): the element's
 * methods drive the deck in the iframe over postMessage, and the deck reports
 * back with `slidechange` (playground/src/pages/embed.astro).
 */

import type { Page } from "playwright";
import { describe, expect, inject, it } from "vitest";
import { useBrowser } from "./helpers/browser";

const browser = useBrowser();

interface Detail {
	slide: number;
	total: number;
	step: number;
	steps: number;
}

/** The embed page, recording every slidechange the element fires (from the start). */
async function embedPage(): Promise<Page> {
	const page = await browser().newPage({ viewport: { width: 1280, height: 900 } });
	await page.addInitScript(() => {
		const w = window as unknown as { events: unknown[] };
		w.events = [];
		document.addEventListener("slidechange", (e) => w.events.push((e as CustomEvent).detail));
	});
	await page.goto(`${inject("baseUrl")}/embed/`);
	return page;
}

const last = (page: Page) =>
	page.evaluate(() => {
		const events = (window as unknown as { events: Detail[] }).events;
		return events[events.length - 1] ?? null;
	});

const frameSlide = (page: Page) =>
	page.evaluate(() => {
		const iframe = document.querySelector("astlide-deck")?.shadowRoot?.querySelector("iframe");
		const path = iframe?.contentWindow?.location.pathname ?? "";
		return Number(path.match(/\/(\d+)\/?$/)?.[1]);
	});

const call = (page: Page, method: "next" | "prev" | "goTo", arg?: number) =>
	page.evaluate(
		([m, a]) => {
			const deck = document.querySelector("astlide-deck") as unknown as Record<
				string,
				(n?: number) => void
			>;
			deck[m as string]?.(a as number | undefined);
		},
		[method, arg] as const,
	);

describe("embedded deck", () => {
	it("opens on the start slide, at 16:9, with the deck's chrome hidden", async () => {
		const page = await embedPage();
		await expect.poll(() => last(page), { timeout: 10_000 }).toMatchObject({ slide: 4, total: 11 });
		expect(await frameSlide(page)).toBe(4);
		const box = await page.evaluate(() => {
			const frame = document.querySelector("astlide-deck")?.shadowRoot?.querySelector(".frame");
			const r = frame?.getBoundingClientRect();
			return r ? r.width / r.height : 0;
		});
		expect(box).toBeCloseTo(16 / 9, 2);
		const embedded = await page.evaluate(() => {
			const doc = document
				.querySelector("astlide-deck")
				?.shadowRoot?.querySelector("iframe")?.contentDocument;
			return doc?.documentElement.hasAttribute("data-embed");
		});
		expect(embedded).toBe(true);
	});

	it("next() / prev() / goTo() move the deck and fire slidechange", async () => {
		const page = await embedPage();
		await expect.poll(() => last(page), { timeout: 10_000 }).toMatchObject({ slide: 4 });

		await call(page, "next");
		await expect.poll(() => last(page)).toMatchObject({ slide: 5, step: 0 });
		expect(await frameSlide(page)).toBe(5);
		const { steps } = (await last(page)) as Detail;
		expect(steps).toBeGreaterThan(0);

		// Slide 5 reveals its steps before moving on.
		await call(page, "next");
		await expect.poll(() => last(page)).toMatchObject({ slide: 5, step: 1 });
		await call(page, "prev");
		await expect.poll(() => last(page)).toMatchObject({ slide: 5, step: 0 });
		await call(page, "prev");
		await expect.poll(() => last(page)).toMatchObject({ slide: 4 });

		await call(page, "goTo", 2);
		await expect.poll(() => last(page)).toMatchObject({ slide: 2 });
		expect(await frameSlide(page)).toBe(2);
		// The host page's own history is left alone.
		expect(new URL(page.url()).pathname).toBe("/embed/");
	});

	it("the control bar drives the deck and shows the counter", async () => {
		const page = await embedPage();
		await expect.poll(() => last(page), { timeout: 10_000 }).toMatchObject({ slide: 4 });
		const bar = page.locator("astlide-deck .controls");
		await expect.poll(() => bar.locator(".counter").textContent()).toBe("4 / 11");
		await bar.locator('button[data-action="next"]').click();
		await expect.poll(() => bar.locator(".counter").textContent()).toBe("5 / 11");
	});
});
