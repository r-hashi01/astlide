import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import PptxGenJS from "pptxgenjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSlideMarkdownRenderer, type Deck, readDeck, readDecks } from "../src/deck";

let base: string;
let deck: Deck;

async function pptx(): Promise<Buffer> {
	const p = new PptxGenJS();
	p.addSlide().addText("Page one", { x: 1, y: 1, w: 8, h: 1 });
	const two = p.addSlide();
	two.addText("Page two", { x: 1, y: 1, w: 8, h: 1 });
	two.addNotes("PowerPoint notes");
	return (await p.write({ outputType: "nodebuffer" })) as Buffer;
}

beforeAll(async () => {
	base = mkdtempSync(join(tmpdir(), "astlide-reader-"));
	const dir = join(base, "q3");
	mkdirSync(dir);
	writeFileSync(join(dir, "_config.json"), JSON.stringify({ title: "Q3 review", theme: "dark" }));
	writeFileSync(
		join(dir, "01-cover.md"),
		"---\nslideLayout: cover\n---\n# Q3 review\n\nSubtitle <script>alert(1)</script>\n\n<!--\nSay **hello**\n-->\n",
	);
	writeFileSync(
		join(dir, "02-code.md"),
		"# Code\n\n```ts {1|2}\nconst a = 1;\nconst b = 2;\n```\n\n```mermaid\nflowchart LR\n  A --> B\n```\n",
	);
	writeFileSync(join(dir, "03-talk.pptx"), await pptx());
	writeFileSync(
		join(dir, "04-plain.html"),
		"---\ntitle: Plain\nnotes: From frontmatter\n---\n<h2>Hi</h2><script>x()</script>\n<!-- comment notes -->\n",
	);
	writeFileSync(
		join(dir, "05-component.mdx"),
		"---\nhidden: true\n---\n# MDX\n\n<Fragment>step</Fragment>\n",
	);
	writeFileSync(join(dir, "notes.txt"), "not a slide");
	mkdirSync(join(base, "empty"));
	deck = await readDeck(dir);
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("readDeck", () => {
	it("reads the config and the slides in order, PowerPoint pages in place", () => {
		expect(deck.name).toBe("q3");
		expect(deck.config).toMatchObject({ title: "Q3 review", theme: "dark" });
		expect(deck.configIssue).toBeUndefined();
		expect(deck.slides.map((s) => [s.number, s.id, s.format])).toEqual([
			[1, "01-cover", "md"],
			[2, "02-code", "md"],
			[3, "03-talk--001", "pptx"],
			[4, "03-talk--002", "pptx"],
			[5, "04-plain", "html"],
			[6, "05-component", "mdx"],
		]);
	});

	it("validates frontmatter with defaults, and finds titles", () => {
		const [cover, code, , page2, plain, mdx] = deck.slides;
		expect(cover?.data).toMatchObject({ slideLayout: "cover", transition: "fade", hidden: false });
		expect(cover?.title).toBe("Q3 review");
		expect(code?.title).toBe("Code");
		// Text boxes aren't titles: only a title placeholder (or frontmatter) is.
		expect(page2?.title).toBeUndefined();
		expect(plain?.title).toBe("Plain");
		expect(mdx?.data.hidden).toBe(true);
	});

	it("renders Markdown like an Astlide site: code steps, Mermaid, no notes comment, no scripts", () => {
		const [cover, code] = deck.slides;
		expect(cover?.html).toContain("<h1");
		expect(cover?.html).not.toContain("<script");
		expect(cover?.html).not.toContain("Say **hello**");
		expect(cover?.notes).toBe("Say **hello**");
		expect(code?.html).toContain('data-code-steps="1|2"');
		expect(code?.html).toMatch(/mermaid/);
	});

	it("keeps HTML slides as written, minus scripts and the notes comment; frontmatter notes win", () => {
		const plain = deck.slides[4];
		expect(plain?.html?.trim()).toBe("<h2>Hi</h2>");
		expect(plain?.notes).toBe("From frontmatter");
	});

	it("turns PowerPoint pages into HTML with their notes", () => {
		const page2 = deck.slides[3];
		expect(page2?.html).toContain("Page two");
		expect(page2?.notes).toBe("PowerPoint notes");
	});

	it("leaves MDX to the host: source, no HTML", () => {
		const mdx = deck.slides[5];
		expect(mdx?.html).toBeUndefined();
		expect(mdx?.body).toContain("<Fragment>step</Fragment>");
	});

	it("keeps scripts when asked", async () => {
		const kept = await readDeck(join(base, "q3"), { slideScripts: true });
		expect(kept.slides[4]?.html).toContain("<script>x()</script>");
	});
});

describe("readDecks", () => {
	it("reads every deck folder with slides, sharing one Markdown renderer", async () => {
		const decks = await readDecks(base, { markdown: await createSlideMarkdownRenderer() });
		expect(decks.map((d) => d.name)).toEqual(["q3"]);
		expect(await readDecks(join(base, "missing"))).toEqual([]);
	});
});

describe("deck problems", () => {
	it("reports a bad _config.json and falls back to the defaults", async () => {
		const dir = join(base, "bad-config");
		mkdirSync(dir);
		writeFileSync(join(dir, "01.md"), "# One\n");
		writeFileSync(join(dir, "_config.json"), '{ "theme": 3 }');
		const bad = await readDeck(dir);
		expect(bad.configIssue).toMatch(/^Invalid _config.json: theme/);
		expect(bad.config.theme).toBe("default");
		writeFileSync(join(dir, "_config.json"), "{ nope");
		expect((await readDeck(dir)).configIssue).toMatch(/^Malformed _config.json/);
	});

	it("names the file with invalid frontmatter", async () => {
		const dir = join(base, "bad-slide");
		mkdirSync(dir);
		writeFileSync(join(dir, "01-x.md"), "---\nhidden: maybe\n---\n# X\n");
		await expect(readDeck(dir)).rejects.toThrow(/01-x\.md: invalid frontmatter: hidden/);
	});
});
