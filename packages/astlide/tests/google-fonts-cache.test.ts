import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FontRegistry, GOOGLE_FONT_LIMITS, loadGoogleFonts } from "@astlide/core/engine";
import { afterEach, describe, expect, it, vi } from "vitest";

/** A real TrueType font (KaTeX ships some) to stand in for downloads. */
const TTF = readFileSync(
	join(
		createRequire(import.meta.url).resolve("katex/package.json"),
		"..",
		"dist",
		"fonts",
		"KaTeX_Main-Regular.ttf",
	),
);

/** Google Fonts stand-in: every weight of a family answers with the same file. */
function serveFonts() {
	const downloads: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			downloads.push(url);
			const family = new URL(url).searchParams.get("family")?.split(":")[0];
			if (url.startsWith("https://fonts.googleapis.com/"))
				return new Response(
					`@font-face{src:url(https://fonts.gstatic.com/${encodeURIComponent(family ?? "")}.ttf)}`,
				);
			return new Response(TTF);
		}),
	);
	return downloads;
}

afterEach(() => vi.unstubAllGlobals());

describe("Google Fonts cache", () => {
	it("stores a file once, under a hash, whatever the family's name", async () => {
		const downloads = serveFonts();
		const dir = mkdtempSync(join(tmpdir(), "astlide-gfonts-"));
		const fonts = new FontRegistry();
		// Two all-non-ASCII names used to share one file name ("-").
		expect(await loadGoogleFonts(fonts, ["游ゴシック", "源ノ角"], dir, [400, 700])).toEqual([]);
		const ttfs = readdirSync(dir).filter((f) => f.endsWith(".ttf"));
		expect(ttfs).toHaveLength(2);
		for (const f of ttfs) expect(f).toMatch(/^[0-9a-f]{64}\.ttf$/);
		expect(downloads.filter((u) => u.endsWith(".ttf"))).toHaveLength(2);
		// Cached: nothing downloaded again.
		const before = downloads.length;
		await loadGoogleFonts(new FontRegistry(), ["游ゴシック"], dir, [400, 700]);
		expect(downloads.length).toBe(before);
	});

	it("loads only so many families, and keeps the cache under its size cap", async () => {
		serveFonts();
		const dir = mkdtempSync(join(tmpdir(), "astlide-gfonts-"));
		const many = Array.from({ length: GOOGLE_FONT_LIMITS.families + 3 }, (_, i) => `F${i}`);
		const missing = await loadGoogleFonts(new FontRegistry(), many, dir, [400]);
		expect(missing).toEqual(many.slice(GOOGLE_FONT_LIMITS.families));
		// A cache over its cap is pruned, oldest first, on the next call.
		const cap = GOOGLE_FONT_LIMITS.cacheBytes;
		GOOGLE_FONT_LIMITS.cacheBytes = 30;
		try {
			writeFileSync(join(dir, `${"0".repeat(64)}.ttf`), Buffer.alloc(100));
			await loadGoogleFonts(new FontRegistry(), [], dir);
			expect(readdirSync(dir).filter((f) => f.endsWith(".ttf")).length).toBeLessThanOrEqual(3);
		} finally {
			GOOGLE_FONT_LIMITS.cacheBytes = cap;
		}
	});
});
