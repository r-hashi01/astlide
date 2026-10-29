/**
 * Built pages run under a script CSP without 'unsafe-inline' (inline scripts
 * are allowed by hash, see utils/csp-hashes): nothing they need is blocked.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";
import { hashBuiltPages } from "../packages/astro/src/csp-hashes";
import { DEFAULT_DECK_CSP } from "../packages/astro/src/internal/csp";
import { slideContentMarks } from "../packages/astro/src/internal/slide-mark";
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

	it("doesn't run a script inside a slide's content unless slideScripts is on", async () => {
		const mark = "e2etest";
		const { start, end } = slideContentMarks(mark);
		const html = `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="${DEFAULT_DECK_CSP}" data-astlide-csp></head><body>
<script>window.layoutRan = true;</script>
<section class="slide"><!--${start}--><p>Imported text</p><script>window.slideRan = true;</script><!--${end}--></section>
</body></html>`;
		for (const slideScripts of [false, true]) {
			const dir = mkdtempSync(join(tmpdir(), "astlide-csp-e2e-"));
			writeFileSync(join(dir, "index.html"), html);
			const result = await hashBuiltPages(dir, { mark, slideScripts });
			expect(result.blocked.length).toBe(slideScripts ? 0 : 1);
			const built = readFileSync(join(dir, "index.html"), "utf8");
			const server = createServer((_req, res) => {
				res.setHeader("content-type", "text/html");
				res.end(built);
			});
			await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
			const page = await browser().newPage();
			const violations: string[] = [];
			page.on("console", (m) => {
				if (/Content.Security.Policy/i.test(m.text())) violations.push(m.text());
			});
			await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
			const ran = await page.evaluate(() => {
				const w = window as unknown as { layoutRan?: boolean; slideRan?: boolean };
				return { layout: w.layoutRan === true, slide: w.slideRan === true };
			});
			expect(ran).toEqual({ layout: true, slide: slideScripts });
			expect(violations.length > 0).toBe(!slideScripts);
			await page.close();
			server.close();
		}
	});
});
