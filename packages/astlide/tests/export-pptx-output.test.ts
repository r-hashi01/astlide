/**
 * End-to-end output validation for the PPTX exporter.
 *
 * Drives the real export pipeline (parseMdxFile → buildSlide → PptxFile →
 * .pptx zip on disk), reads the resulting file back through JSZip, and
 * asserts on the OOXML package structure / contents that downstream tools
 * (Keynote, PowerPoint, Google Slides) actually rely on.
 *
 * The piecewise unit tests in `ooxml-writer.test.ts` / `hast-builder.test.ts`
 * / `mdx-parser.test.ts` cover their layer in isolation; this suite is the
 * only place that exercises the full pipeline against real MDX fixtures.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSlide } from "../src/cli/pptx/hast-builder";
import { parseMdxFile } from "../src/cli/pptx/mdx-parser";
import { PptxFile } from "../src/cli/pptx/ooxml-writer";
import { getTheme } from "../src/cli/pptx/theme-map";

const FIXTURES = [
	{
		name: "01-cover.mdx",
		body: `---\nslideLayout: cover\ntitle: Welcome\n---\n\n# Welcome to Astlide\n`,
	},
	{
		name: "02-default.mdx",
		body: `---\nslideLayout: default\n---\n\n# Body slide\n\n- Bullet one\n- Bullet two\n`,
	},
	{
		name: "03-hidden.mdx",
		body: `---\nslideLayout: default\nhidden: true\n---\n\n# Should be skipped\n`,
	},
	{
		name: "04-code.mdx",
		body: `---\nslideLayout: code\n---\n\n# Code\n\n\`\`\`ts\nconst x = 1;\n\`\`\`\n`,
	},
];

let tmpDir: string;
let outputPath: string;
let zip: JSZip;

beforeAll(async () => {
	tmpDir = mkdtempSync(join(tmpdir(), "astlide-pptx-"));
	outputPath = join(tmpDir, "deck.pptx");

	const pptx = new PptxFile({
		title: "Integration Test Deck",
		author: "test-suite",
		theme: getTheme("dark"),
	});

	for (const { name, body } of FIXTURES) {
		const filePath = join(tmpDir, name);
		writeFileSync(filePath, body);
		const parsed = await parseMdxFile(filePath);
		if (parsed.frontmatter.hidden === true) continue;
		pptx.addSlide(buildSlide(parsed, { theme: "dark" }));
	}

	await pptx.save(outputPath);

	const buf = readFileSync(outputPath);
	zip = await JSZip.loadAsync(buf);
});

afterAll(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("PPTX file is a valid OOXML package", () => {
	it("output is a non-trivial zip archive", () => {
		const stat = readFileSync(outputPath);
		expect(stat.length).toBeGreaterThan(1024);
	});

	it("contains all OOXML boilerplate parts", () => {
		const required = [
			"[Content_Types].xml",
			"_rels/.rels",
			"ppt/presentation.xml",
			"ppt/_rels/presentation.xml.rels",
			"ppt/slideMasters/slideMaster1.xml",
			"ppt/slideMasters/_rels/slideMaster1.xml.rels",
			"ppt/slideLayouts/slideLayout1.xml",
			"ppt/slideLayouts/_rels/slideLayout1.xml.rels",
			"ppt/theme/theme1.xml",
			"docProps/core.xml",
			"docProps/app.xml",
		];
		for (const name of required) {
			expect(zip.file(name), `missing part: ${name}`).not.toBeNull();
		}
	});

	it("emits exactly one slide.xml per visible slide and skips hidden", () => {
		// 4 fixtures, 1 hidden → 3 visible slides expected
		expect(zip.file("ppt/slides/slide1.xml")).not.toBeNull();
		expect(zip.file("ppt/slides/slide2.xml")).not.toBeNull();
		expect(zip.file("ppt/slides/slide3.xml")).not.toBeNull();
		expect(zip.file("ppt/slides/slide4.xml")).toBeNull();
	});

	it("each slide.xml has its companion _rels file", async () => {
		for (let i = 1; i <= 3; i++) {
			expect(zip.file(`ppt/slides/_rels/slide${i}.xml.rels`)).not.toBeNull();
		}
	});
});

describe("Theme propagation", () => {
	it("dark theme colours land in theme1.xml", async () => {
		const themeXml = await zip.file("ppt/theme/theme1.xml")!.async("string");
		const dark = getTheme("dark");
		// ThemeColors uses RRGGBB hex (no leading #) — assert the codes are embedded verbatim.
		expect(themeXml).toContain(dark.bg);
		expect(themeXml).toContain(dark.fg);
		expect(themeXml).toContain(dark.accent);
	});
});

describe("Document metadata", () => {
	it("title and author are persisted in core.xml", async () => {
		const xml = await zip.file("docProps/core.xml")!.async("string");
		expect(xml).toContain("Integration Test Deck");
		expect(xml).toContain("test-suite");
	});

	it("slide count is persisted in app.xml", async () => {
		const xml = await zip.file("docProps/app.xml")!.async("string");
		expect(xml).toMatch(/<Slides>\s*3\s*<\/Slides>/);
	});
});

describe("Slide content survives the pipeline", () => {
	it("cover slide title text appears in slide1.xml", async () => {
		const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
		expect(xml).toContain("Welcome to Astlide");
	});

	it("default slide bullets appear in slide2.xml", async () => {
		const xml = await zip.file("ppt/slides/slide2.xml")!.async("string");
		expect(xml).toContain("Bullet one");
		expect(xml).toContain("Bullet two");
	});

	it("code fence content lands in slide3.xml", async () => {
		const xml = await zip.file("ppt/slides/slide3.xml")!.async("string");
		expect(xml).toContain("const x = 1");
	});
});

describe("XML well-formedness — every emitted XML part starts with a declaration", () => {
	it("every .xml file starts with <?xml", async () => {
		const xmlFiles = Object.keys(zip.files).filter((n) => n.endsWith(".xml"));
		expect(xmlFiles.length).toBeGreaterThan(5);
		for (const name of xmlFiles) {
			const content = await zip.file(name)!.async("string");
			expect(content.trimStart().startsWith("<?xml"), `${name} missing XML decl`).toBe(true);
		}
	});

	it("every .rels file starts with <?xml", async () => {
		const relsFiles = Object.keys(zip.files).filter((n) => n.endsWith(".rels"));
		expect(relsFiles.length).toBeGreaterThan(2);
		for (const name of relsFiles) {
			const content = await zip.file(name)!.async("string");
			expect(content.trimStart().startsWith("<?xml"), `${name} missing XML decl`).toBe(true);
		}
	});
});
