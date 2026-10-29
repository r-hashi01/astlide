import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderDeck, writePrintView } from "../src/render";
import { templateFixture } from "./fixtures/pptx-template";

let base: string;
let deckDir: string;

beforeAll(() => {
	base = mkdtempSync(join(tmpdir(), "astlide-render-deck-"));
	deckDir = join(base, "q3");
	mkdirSync(deckDir);
	writeFileSync(
		join(deckDir, "_config.json"),
		JSON.stringify({ title: "Q3 <review>", theme: "dark" }),
	);
	writeFileSync(
		join(deckDir, "01-cover.md"),
		"---\nslideLayout: cover\n---\n# Q3 review\n\n<!--\nSay hi\n-->\n",
	);
	writeFileSync(join(deckDir, "02-hidden.md"), "---\nhidden: true\n---\n# Hidden\n");
	writeFileSync(
		join(deckDir, "03-html.html"),
		'---\nbackground: "#0b132b"\nnotes: "a < b"\n---\n<h2>Plain</h2>\n',
	);
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("writePrintView", () => {
	it("writes the print view an Astlide site has: styles, slides, notes for the exporter", async () => {
		const site = join(base, "site");
		const view = await writePrintView({ dir: deckDir, site });
		expect(view.html).toBe(join(site, "q3", "all", "index.html"));
		expect(view.theme).toBe("dark");
		const page = readFileSync(view.html, "utf-8");
		expect(page).toContain(
			'<html lang="en" data-theme="dark" data-print data-astlide-all data-diagrams-ready>',
		);
		expect(page).toContain("<title>Q3 &lt;review&gt; — all slides</title>");
		for (const sheet of ["base.css", "theme-dark.css", "theme-forest.css", "slide.css"]) {
			expect(page).toContain(`href="/_astlide/css/${sheet}"`);
			expect(existsSync(join(site, "_astlide", "css", sheet))).toBe(true);
		}
		// Hidden slides are left out; the rest are numbered among themselves.
		expect(page.match(/<section class="slide/g)).toHaveLength(2);
		expect(page).toContain('aria-label="Slide 2 of 2"');
		expect(page).not.toContain("Hidden");
		expect(page).toContain('<div data-slide-notes="meta" hidden>Say hi</div>');
		expect(page).toContain('<div data-slide-notes="meta" hidden>a &lt; b</div>');
		expect(page).toContain('style="background-color: #0b132b;"');
		expect(page).toContain("fonts.googleapis.com");
		const noFont = readFileSync(
			(await writePrintView({ dir: deckDir, site, fontHref: null })).html,
			"utf-8",
		);
		expect(noFont).not.toContain("fonts.googleapis.com");
	});

	it("uses a PowerPoint template as the theme, with its artwork and pictures", async () => {
		const site = join(base, "site-template");
		const view = await writePrintView({ dir: deckDir, site, template: await templateFixture() });
		expect(view.theme).toBe("template");
		const page = readFileSync(view.html, "utf-8");
		expect(page).toContain('data-theme="template"');
		expect(page).toContain('href="/_astlide/css/template.css"');
		expect(page).toContain("astlide-tpl-title-slide");
		expect(readFileSync(join(site, "_astlide", "css", "template.css"), "utf-8")).toContain(
			'[data-theme="template"]',
		);
	});

	it("refuses MDX slides and themes it doesn't have", async () => {
		const mdx = join(base, "mdx");
		mkdirSync(mdx);
		writeFileSync(join(mdx, "01.mdx"), "# MDX\n");
		await expect(writePrintView({ dir: mdx, site: join(base, "s1") })).rejects.toThrow(
			/MDX slides need an Astro build .*01\.mdx/,
		);
		const odd = join(base, "odd-theme");
		mkdirSync(odd);
		writeFileSync(join(odd, "_config.json"), JSON.stringify({ theme: "brand" }));
		writeFileSync(join(odd, "01.md"), "# One\n");
		await expect(writePrintView({ dir: odd, site: join(base, "s2") })).rejects.toThrow(
			/unknown theme "brand"/,
		);
	});
});

describe("renderDeck", () => {
	it("writes an editable PowerPoint without a build", async () => {
		const output = join(base, "out", "q3.pptx");
		const deck = await renderDeck({ dir: deckDir, format: "pptx", output, root: base });
		expect(deck.slides).toHaveLength(3);
		const zip = await JSZip.loadAsync(readFileSync(output));
		const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
		expect(slides).toHaveLength(2);
		expect(await zip.file("ppt/slides/slide1.xml")?.async("string")).toContain("Q3 review");
		expect(await zip.file("docProps/core.xml")?.async("string")).toContain("Q3 &lt;review&gt;");
	}, 120_000);
});
