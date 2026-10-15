/**
 * One Chromium per test file (Playwright), and pages on the served playground.
 * In CI: `bunx playwright install --with-deps chromium` first.
 */

import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, inject } from "vitest";

/** Launch Chromium for the file's tests; closes it afterwards. */
export function useBrowser(): () => Browser {
	let browser: Browser | undefined;
	beforeAll(async () => {
		browser = await chromium.launch();
	});
	afterAll(async () => {
		await browser?.close();
	});
	return () => {
		if (!browser) throw new Error("browser not started");
		return browser;
	};
}

/** Open `path` of the playground at a 1920×1080 viewport. */
export async function open(browser: Browser, path: string): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	await page.goto(`${inject("baseUrl")}${path}`);
	return page;
}
