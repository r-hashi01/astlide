/**
 * Built pages run under a script CSP without 'unsafe-inline' (inline scripts
 * are allowed by hash, see utils/csp-hashes): nothing they need is blocked.
 */

import { describe, expect, inject, it } from "vitest";
import { useBrowser } from "./helpers/browser";

const browser = useBrowser();

const PAGES = [
	"/",
	"/tour/1/",
	"/tour/5/", // HTML slide
	"/tour/14/", // embeds
	"/tour/18/", // math
	"/tour/19/", // mermaid diagram
	"/tour/23/?presenter",
	"/tour/all/",
	"/example-deck/1/",
];

describe("CSP", () => {
	it("doesn't allow inline scripts by 'unsafe-inline' in built pages", async () => {
		const page = await browser().newPage();
		for (const path of PAGES) {
			await page.goto(`${inject("baseUrl")}${path}`);
			const policy = await page.getAttribute(
				'meta[http-equiv="Content-Security-Policy"]',
				"content",
			);
			const scriptSrc = policy?.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
			expect(scriptSrc, path).toMatch(/^\s*script-src 'self'/);
			expect(scriptSrc, path).not.toContain("'unsafe-inline'");
			// Deck pages have inline scripts, allowed by their hashes (the index has none).
			if (path !== "/") expect(scriptSrc, path).toContain("'sha256-");
		}
		await page.close();
	});

	it("blocks nothing the pages need", async () => {
		const context = await browser().newContext({ viewport: { width: 1920, height: 1080 } });
		await context.addInitScript(() => {
			const seen: string[] = [];
			(window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
			document.addEventListener("securitypolicyviolation", (e) =>
				seen.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`),
			);
		});
		const page = await context.newPage();
		const console: string[] = [];
		page.on("console", (m) => {
			if (/Content.Security.Policy/i.test(m.text())) console.push(m.text());
		});
		for (const path of PAGES) {
			await page.goto(`${inject("baseUrl")}${path}`);
			await page.waitForLoadState("networkidle");
			const violations = await page.evaluate(
				() => (window as unknown as { __cspViolations: string[] }).__cspViolations,
			);
			expect(violations, path).toEqual([]);
		}
		// Moving between slides swaps pages in place under the first page's policy.
		await page.goto(`${inject("baseUrl")}/tour/1/`);
		await page.waitForSelector(".slide");
		for (let i = 0; i < 20; i++) {
			await page.keyboard.press("ArrowRight");
			await page.waitForTimeout(100);
		}
		await page.waitForLoadState("networkidle");
		expect(page.url()).not.toMatch(/\/tour\/1\/$/);
		const afterNavigation = await page.evaluate(
			() => (window as unknown as { __cspViolations: string[] }).__cspViolations,
		);
		expect(afterNavigation).toEqual([]);
		expect(console).toEqual([]);
		await context.close();
	});
});
