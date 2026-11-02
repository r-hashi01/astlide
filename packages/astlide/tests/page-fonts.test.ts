import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_EA_FONT, loadPageFonts, pageCss } from "../src/engine";

/** A TrueType font every install has (KaTeX's), served by the site as "Test JP". */
const FONT = join(
	dirname(createRequire(import.meta.url).resolve("katex/package.json")),
	"dist",
	"fonts",
	"KaTeX_Main-Regular.ttf",
);

const dist = mkdtempSync(join(tmpdir(), "astlide-page-fonts-"));
afterAll(() => rmSync(dist, { recursive: true, force: true }));
mkdirSync(join(dist, "fonts"));
copyFileSync(FONT, join(dist, "fonts", "test.ttf"));
writeFileSync(
	join(dist, "site.css"),
	'@font-face{font-family:"Test JP";src:url(/fonts/test.ttf) format("truetype")}body{font-family:"Test JP"}',
);
const page = (name: string, text: string) => {
	const file = join(dist, `${name}.html`);
	writeFileSync(
		file,
		`<!doctype html><html><head><link rel="stylesheet" href="/site.css"></head><body><section class="slide"><p>${text}</p></section></body></html>`,
	);
	return file;
};

describe("loadPageFonts", () => {
	it("names and measures East Asian text with the page's CJK font", async () => {
		const html = page("ja", "日本語のスライド");
		const result = await loadPageFonts(html, pageCss(html, dist), dist, join(dist, "cache"));
		expect(result.eaFont).toBe("Test JP");
		expect(result.missing).toEqual([]);
		expect(result.noCjkFont).toBe(false);
		// The page's font is the CJK fallback too: Japanese text resolves to it.
		expect(result.fonts.files()).toContain(join(dist, "fonts", "test.ttf"));
	});

	it("names the default East Asian font when the CSS has none", async () => {
		writeFileSync(join(dist, "plain.css"), "body{font-family:sans-serif}");
		const plain = join(dist, "plain.html");
		writeFileSync(
			plain,
			'<!doctype html><html><head><link rel="stylesheet" href="/plain.css"></head><body><section class="slide"><p>Plain</p></section></body></html>',
		);
		const result = await loadPageFonts(plain, pageCss(plain, dist), dist, join(dist, "cache"));
		expect(result.eaFont).toBe(DEFAULT_EA_FONT);
		expect(result.noCjkFont).toBe(false);
	});
});
