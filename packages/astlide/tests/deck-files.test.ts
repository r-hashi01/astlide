import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	DECKS_DIR,
	decksDir,
	decksDirIn,
	filesIn,
	HTML_EXTENSION,
	PPTX_EXTENSION,
	pptxSlideId,
	SLIDE_EXTENSION,
	sameNameSlides,
} from "../src/deck/files";

const dir = mkdtempSync(join(tmpdir(), "astlide-deck-files-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("deck files", () => {
	it("lists slide files below a folder, relative with /, without Office lock files", async () => {
		mkdirSync(join(dir, "talk", "part"), { recursive: true });
		for (const f of [
			"talk/01-a.mdx",
			"talk/part/02-b.html",
			"talk/03.pptx",
			"talk/~$03.pptx",
			"talk/~$x.html",
			"talk/notes.txt",
		])
			writeFileSync(join(dir, f), "");
		const slides = await filesIn(dir, (n) => SLIDE_EXTENSION.test(n) || PPTX_EXTENSION.test(n));
		expect(slides.sort()).toEqual(["talk/01-a.mdx", "talk/03.pptx", "talk/part/02-b.html"]);
		expect(await filesIn(dir, (n) => HTML_EXTENSION.test(n))).toEqual(["talk/part/02-b.html"]);
	});

	it("numbers a .pptx file's pages so they sort among the deck's files", () => {
		expect(pptxSlideId("talk/03-import.pptx", 7)).toBe("talk/03-import--007");
	});

	it("knows where a project keeps its decks", () => {
		expect(DECKS_DIR).toBe("src/content/decks");
		expect(decksDir("/p")).toBe(join("/p", "src", "content", "decks"));
		expect(decksDirIn("/p/app")).toBe(join("/p/app", "content", "decks"));
	});

	it("refuses slides whose names differ only in extension", () => {
		expect(sameNameSlides(["01-a.md", "02-b.html", "03-talk.pptx"])).toBeNull();
		const error = sameNameSlides(["01-a.md", "01-a.html", "q/02-b.mdx", "q/02-b.md", "03.pptx"]);
		expect(error?.message).toContain("01-a.html and 01-a.md");
		expect(error?.message).toContain("q/02-b.md and q/02-b.mdx");
		expect(error?.message).not.toContain("03.pptx");
	});
});
