/**
 * The toolbar's PDF download (`@astlide/crispdf` over the `/[deck]/all` print
 * view in a hidden iframe): the text-hiding stylesheet goes into the iframe's
 * document, not the deck page's (else every slide's text is drawn twice), and
 * the page's CSP lets crispdf fetch fonts from Google Fonts.
 */

import { describe, expect, it } from "vitest";
import { open, useBrowser } from "./helpers/browser";

const browser = useBrowser();

describe("PDF download", () => {
	it("captures the slides in their own document, and may fetch Google Fonts", async () => {
		const page = await open(browser(), "/example-deck/1/");
		// Offline: whether the CSP allows the request is decided before it's sent.
		await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
		const result = await page.evaluate(async () => {
			const blocked: string[] = [];
			document.addEventListener("securitypolicyviolation", (e) => {
				blocked.push(`${e.violatedDirective} ${e.blockedURI}`);
			});
			let styleInDeckPage = false;
			new MutationObserver(() => {
				if (document.getElementById("__vellum-capture-style")) styleInDeckPage = true;
			}).observe(document.head, { childList: true });
			const download = (
				window as unknown as {
					__astlide_download_pdf?: (o: {
						deck: string;
					}) => Promise<{ blob: Blob; warnings: string[] }>;
				}
			).__astlide_download_pdf;
			if (!download) throw new Error("no PDF download");
			const { blob } = await download({ deck: "example-deck" });
			return { blocked, styleInDeckPage, type: blob.type };
		});
		expect(result.type).toBe("application/pdf");
		expect(result.styleInDeckPage).toBe(false);
		expect(result.blocked.filter((b) => b.startsWith("connect-src"))).toEqual([]);
		await page.close();
	}, 120_000);
});
