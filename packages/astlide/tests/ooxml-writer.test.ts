import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	crc32,
	emu,
	esc,
	hpt,
	PptxFile,
	type SlideSpec,
	ZipWriter,
} from "../src/cli/pptx/ooxml-writer";

/**
 * Extract a file from a ZIP buffer by path name.
 * Walks local file headers to find the entry and decompresses it.
 */
function extractFromZip(zipBuf: Buffer, targetPath: string): string | null {
	let offset = 0;
	while (offset < zipBuf.length - 4) {
		const sig = zipBuf.readUInt32LE(offset);
		if (sig !== 0x04034b50) break; // not a local file header

		const compressedSize = zipBuf.readUInt32LE(offset + 18);
		const uncompressedSize = zipBuf.readUInt32LE(offset + 22);
		const nameLen = zipBuf.readUInt16LE(offset + 26);
		const extraLen = zipBuf.readUInt16LE(offset + 28);
		const name = zipBuf.subarray(offset + 30, offset + 30 + nameLen).toString("utf-8");
		const dataStart = offset + 30 + nameLen + extraLen;

		if (name === targetPath) {
			if (compressedSize === 0 && uncompressedSize === 0) return "";
			const compressed = zipBuf.subarray(dataStart, dataStart + compressedSize);
			return inflateRawSync(compressed).toString("utf-8");
		}

		offset = dataStart + compressedSize;
	}
	return null;
}

// ── emu ──

describe("emu", () => {
	it("converts 1 inch to 914400 EMU", () => {
		expect(emu(1)).toBe(914400);
	});

	it("converts 0 to 0", () => {
		expect(emu(0)).toBe(0);
	});

	it("converts 10 to 9144000", () => {
		expect(emu(10)).toBe(9144000);
	});

	it("rounds fractional results", () => {
		expect(emu(0.4)).toBe(Math.round(0.4 * 914400));
	});
});

// ── hpt ──

describe("hpt", () => {
	it("converts 12 pt to 1200", () => {
		expect(hpt(12)).toBe(1200);
	});

	it("converts 0 to 0", () => {
		expect(hpt(0)).toBe(0);
	});

	it("converts 44 to 4400", () => {
		expect(hpt(44)).toBe(4400);
	});
});

// ── esc ──

describe("esc", () => {
	it("escapes & to &amp;", () => {
		expect(esc("a&b")).toBe("a&amp;b");
	});

	it("escapes < to &lt;", () => {
		expect(esc("a<b")).toBe("a&lt;b");
	});

	it("escapes > to &gt;", () => {
		expect(esc("a>b")).toBe("a&gt;b");
	});

	it('escapes " to &quot;', () => {
		expect(esc('a"b')).toBe("a&quot;b");
	});

	it("escapes ' to &apos;", () => {
		expect(esc("a'b")).toBe("a&apos;b");
	});

	it("handles multiple special chars", () => {
		expect(esc('<a href="x">&')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;");
	});

	it("returns plain text unchanged", () => {
		expect(esc("hello world")).toBe("hello world");
	});
});

// ── crc32 ──

describe("crc32", () => {
	it("computes correct CRC-32 for IEEE test vector", () => {
		expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
	});

	it("computes CRC-32 of empty buffer as 0", () => {
		expect(crc32(Buffer.alloc(0))).toBe(0);
	});

	it("produces different values for different inputs", () => {
		expect(crc32(Buffer.from("a"))).not.toBe(crc32(Buffer.from("b")));
	});
});

// ── ZipWriter ──

describe("ZipWriter", () => {
	it("produces buffer starting with ZIP magic bytes", () => {
		const zip = new ZipWriter();
		zip.add("test.txt", "hello");
		const buf = zip.toBuffer();
		expect(buf[0]).toBe(0x50); // P
		expect(buf[1]).toBe(0x4b); // K
		expect(buf[2]).toBe(0x03);
		expect(buf[3]).toBe(0x04);
	});

	it("contains the added file path in the buffer", () => {
		const zip = new ZipWriter();
		zip.add("my-file.txt", "content");
		const buf = zip.toBuffer();
		expect(buf.includes(Buffer.from("my-file.txt"))).toBe(true);
	});

	it("can add multiple files", () => {
		const zip = new ZipWriter();
		zip.add("a.txt", "aaa");
		zip.add("b.txt", "bbb");
		zip.add("c.txt", "ccc");
		const buf = zip.toBuffer();
		expect(buf.includes(Buffer.from("a.txt"))).toBe(true);
		expect(buf.includes(Buffer.from("b.txt"))).toBe(true);
		expect(buf.includes(Buffer.from("c.txt"))).toBe(true);
	});

	it("ends with EOCD signature", () => {
		const zip = new ZipWriter();
		zip.add("f.txt", "data");
		const buf = zip.toBuffer();
		// EOCD signature 0x06054b50 appears near the end
		const eocdSig = Buffer.alloc(4);
		eocdSig.writeUInt32LE(0x06054b50);
		expect(buf.includes(eocdSig)).toBe(true);
	});
});

// ── PptxFile ──

describe("PptxFile", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "pptx-test-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	const minimalSlide: SlideSpec = {
		background: "FFFFFF",
		elements: [],
	};

	it("constructs with default options", () => {
		expect(() => new PptxFile()).not.toThrow();
	});

	it("constructs with custom options", () => {
		expect(
			() =>
				new PptxFile({
					title: "Test",
					author: "Author",
					theme: {
						bg: "000000",
						fg: "FFFFFF",
						primary: "3B82F6",
						secondary: "64748B",
						accent: "F59E0B",
						muted: "F1F5F9",
						codeBg: "1E1E1E",
						codeFg: "D4D4D4",
					},
				}),
		).not.toThrow();
	});

	it("addSlide accepts a valid SlideSpec", () => {
		const pptx = new PptxFile();
		expect(() => pptx.addSlide(minimalSlide)).not.toThrow();
	});

	it("save() creates a file with ZIP magic bytes", async () => {
		const pptx = new PptxFile();
		pptx.addSlide(minimalSlide);
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		expect(buf[0]).toBe(0x50);
		expect(buf[1]).toBe(0x4b);
	});

	it("save() includes required OOXML parts", async () => {
		const pptx = new PptxFile();
		pptx.addSlide(minimalSlide);
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const contentTypes = extractFromZip(buf, "[Content_Types].xml");
		expect(contentTypes).not.toBeNull();
		expect(contentTypes).toContain("presentation.xml");

		const presentation = extractFromZip(buf, "ppt/presentation.xml");
		expect(presentation).not.toBeNull();

		const slide = extractFromZip(buf, "ppt/slides/slide1.xml");
		expect(slide).not.toBeNull();
	});

	it("save() includes correct number of slides", async () => {
		const pptx = new PptxFile();
		pptx.addSlide(minimalSlide);
		pptx.addSlide({ background: "000000", elements: [] });
		pptx.addSlide({ background: "FF0000", elements: [] });
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		expect(extractFromZip(buf, "ppt/slides/slide1.xml")).not.toBeNull();
		expect(extractFromZip(buf, "ppt/slides/slide2.xml")).not.toBeNull();
		expect(extractFromZip(buf, "ppt/slides/slide3.xml")).not.toBeNull();
	});

	it("save() includes hyperlink when TextRun has hyperlink", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({
			background: "FFFFFF",
			elements: [
				{
					type: "textbox",
					runs: [
						{
							text: "Click here",
							options: { hyperlink: { url: "https://example.com" } },
						},
					],
					x: 0,
					y: 0,
					w: 5,
					h: 1,
				},
			],
		});
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const rels = extractFromZip(buf, "ppt/slides/_rels/slide1.xml.rels");
		expect(rels).not.toBeNull();
		expect(rels).toContain("https://example.com");
	});
});

// ── PptxFile XML content verification ──

describe("PptxFile XML content", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "pptx-xml-test-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("slide XML contains the correct background color", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({ background: "1E293B", elements: [] });
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const slideXml = extractFromZip(buf, "ppt/slides/slide1.xml");
		expect(slideXml).not.toBeNull();
		expect(slideXml).toContain('val="1E293B"');
	});

	it("slide XML contains TextBox text content", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({
			background: "FFFFFF",
			elements: [
				{
					type: "textbox",
					runs: [{ text: "Hello World" }],
					x: 0,
					y: 0,
					w: 10,
					h: 1,
				},
			],
		});
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const slideXml = extractFromZip(buf, "ppt/slides/slide1.xml");
		expect(slideXml).not.toBeNull();
		expect(slideXml).toContain("<a:t>Hello World</a:t>");
	});

	it("slide XML contains bold attribute when TextRun is bold", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({
			background: "FFFFFF",
			elements: [
				{
					type: "textbox",
					runs: [{ text: "Bold text", options: { bold: true } }],
					x: 0,
					y: 0,
					w: 10,
					h: 1,
				},
			],
		});
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const slideXml = extractFromZip(buf, "ppt/slides/slide1.xml");
		expect(slideXml).not.toBeNull();
		expect(slideXml).toContain('b="1"');
	});

	it("slide XML contains italic attribute when TextRun is italic", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({
			background: "FFFFFF",
			elements: [
				{
					type: "textbox",
					runs: [{ text: "Italic text", options: { italic: true } }],
					x: 0,
					y: 0,
					w: 10,
					h: 1,
				},
			],
		});
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const slideXml = extractFromZip(buf, "ppt/slides/slide1.xml");
		expect(slideXml).not.toBeNull();
		expect(slideXml).toContain('i="1"');
	});

	it("slide XML contains fontSize in hundredths-of-a-point", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({
			background: "FFFFFF",
			elements: [
				{
					type: "textbox",
					runs: [{ text: "Big", options: { fontSize: 44 } }],
					x: 0,
					y: 0,
					w: 10,
					h: 1,
				},
			],
		});
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const slideXml = extractFromZip(buf, "ppt/slides/slide1.xml");
		expect(slideXml).not.toBeNull();
		// 44pt → 4400 hundredths of a point
		expect(slideXml).toContain('sz="4400"');
	});

	it("slide XML contains Rect element with correct fill color", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({
			background: "FFFFFF",
			elements: [
				{
					type: "rect",
					x: 0,
					y: 0,
					w: 10,
					h: 5.625,
					fill: "FF0000",
				},
			],
		});
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const slideXml = extractFromZip(buf, "ppt/slides/slide1.xml");
		expect(slideXml).not.toBeNull();
		expect(slideXml).toContain('val="FF0000"');
	});

	it("slide XML converts dimensions to EMU", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({
			background: "FFFFFF",
			elements: [
				{
					type: "textbox",
					runs: [{ text: "Test" }],
					x: 1,
					y: 2,
					w: 5,
					h: 3,
				},
			],
		});
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const slideXml = extractFromZip(buf, "ppt/slides/slide1.xml");
		expect(slideXml).not.toBeNull();
		// 1 inch = 914400 EMU, 2 inches = 1828800, 5 = 4572000, 3 = 2743200
		expect(slideXml).toContain('x="914400"');
		expect(slideXml).toContain('y="1828800"');
		expect(slideXml).toContain('cx="4572000"');
		expect(slideXml).toContain('cy="2743200"');
	});

	it("core.xml contains title and author", async () => {
		const pptx = new PptxFile({ title: "My Deck", author: "John Doe" });
		pptx.addSlide({ background: "FFFFFF", elements: [] });
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const coreXml = extractFromZip(buf, "docProps/core.xml");
		expect(coreXml).not.toBeNull();
		expect(coreXml).toContain("My Deck");
		expect(coreXml).toContain("John Doe");
	});

	it("slide XML escapes special characters in text", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({
			background: "FFFFFF",
			elements: [
				{
					type: "textbox",
					runs: [{ text: "A < B & C > D" }],
					x: 0,
					y: 0,
					w: 10,
					h: 1,
				},
			],
		});
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const slideXml = extractFromZip(buf, "ppt/slides/slide1.xml");
		expect(slideXml).not.toBeNull();
		expect(slideXml).toContain("A &lt; B &amp; C &gt; D");
	});

	it("slide XML contains font face when specified", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({
			background: "FFFFFF",
			elements: [
				{
					type: "textbox",
					runs: [{ text: "code", options: { fontFace: "Courier New" } }],
					x: 0,
					y: 0,
					w: 10,
					h: 1,
				},
			],
		});
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const slideXml = extractFromZip(buf, "ppt/slides/slide1.xml");
		expect(slideXml).not.toBeNull();
		expect(slideXml).toContain('typeface="Courier New"');
	});

	it("slide XML contains text color when specified", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({
			background: "FFFFFF",
			elements: [
				{
					type: "textbox",
					runs: [{ text: "colored", options: { color: "3B82F6" } }],
					x: 0,
					y: 0,
					w: 10,
					h: 1,
				},
			],
		});
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const slideXml = extractFromZip(buf, "ppt/slides/slide1.xml");
		expect(slideXml).not.toBeNull();
		expect(slideXml).toContain('val="3B82F6"');
	});

	it("slide XML contains bullet marker for bulleted runs", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({
			background: "FFFFFF",
			elements: [
				{
					type: "textbox",
					runs: [
						{
							text: "item",
							options: { bullet: true, breakLine: true },
						},
					],
					x: 0,
					y: 0,
					w: 10,
					h: 1,
				},
			],
		});
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const slideXml = extractFromZip(buf, "ppt/slides/slide1.xml");
		expect(slideXml).not.toBeNull();
		expect(slideXml).toContain("a:buChar");
	});

	it("slide XML contains numbered bullet for ordered list runs", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({
			background: "FFFFFF",
			elements: [
				{
					type: "textbox",
					runs: [
						{
							text: "first",
							options: { bullet: { type: "number" }, breakLine: true },
						},
					],
					x: 0,
					y: 0,
					w: 10,
					h: 1,
				},
			],
		});
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const slideXml = extractFromZip(buf, "ppt/slides/slide1.xml");
		expect(slideXml).not.toBeNull();
		expect(slideXml).toContain("a:buAutoNum");
		expect(slideXml).toContain("arabicPeriod");
	});

	it("app.xml contains correct slide count", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({ background: "FFFFFF", elements: [] });
		pptx.addSlide({ background: "000000", elements: [] });
		pptx.addSlide({ background: "FF0000", elements: [] });
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const appXml = extractFromZip(buf, "docProps/app.xml");
		expect(appXml).not.toBeNull();
		expect(appXml).toContain("<Slides>3</Slides>");
	});

	it("slide XML contains a:alpha for fillTransparency on Rect", async () => {
		const pptx = new PptxFile();
		pptx.addSlide({
			background: "FFFFFF",
			elements: [
				{
					type: "rect",
					x: 0,
					y: 0,
					w: 10,
					h: 5.625,
					fill: "000000",
					fillTransparency: 50,
				},
			],
		});
		const outPath = join(tmpDir, "test.pptx");
		await pptx.save(outPath);

		const buf = readFileSync(outPath);
		const slideXml = extractFromZip(buf, "ppt/slides/slide1.xml");
		expect(slideXml).not.toBeNull();
		// 50% transparency → alpha = (100 - 50) * 1000 = 50000
		expect(slideXml).toContain('val="50000"');
		expect(slideXml).toContain("a:alpha");
	});
});
