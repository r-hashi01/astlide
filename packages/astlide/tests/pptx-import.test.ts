import PptxGenJS from "pptxgenjs";
import { beforeAll, describe, expect, it } from "vitest";
import { toEot } from "../src/cli/pptx/eot";
import { colorOf } from "../src/pptx/color";
import { fontFromEot, type ImportedDeck, pptxToSlides } from "../src/pptx/import";
import { parseXml } from "../src/pptx/xml";
import { readZip } from "../src/pptx/zip";

/** 1×1 red PNG. */
const PNG =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

async function fixture(): Promise<Buffer> {
	const p = new PptxGenJS();
	p.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 in
	p.title = "Fixture";
	p.author = "Astlide";
	p.defineSlideMaster({
		title: "BRAND",
		background: { color: "F8FAFC" },
		objects: [
			{ rect: { x: 0, y: 7, w: "100%", h: 0.5, fill: { color: "1E3A8A" } } },
			{
				placeholder: {
					options: {
						name: "title",
						type: "title",
						x: 0.5,
						y: 0.4,
						w: 12,
						h: 1,
						fontSize: 36,
						bold: true,
						color: "1E3A8A",
					},
					text: "",
				},
			},
		],
	});
	const s1 = p.addSlide({ masterName: "BRAND" });
	s1.addText("Imported title", { placeholder: "title" });
	s1.addText(
		[
			{ text: "First point", options: { bullet: true } },
			{ text: "Second <point> & more", options: { bullet: true, color: "DC2626" } },
		],
		{ x: 0.5, y: 1.6, w: 6, h: 2, fontSize: 20 },
	);
	s1.addNotes("Line one\nLine two");
	const s2 = p.addSlide();
	s2.background = { color: "0F172A" };
	s2.addShape(p.ShapeType.ellipse, { x: 1, y: 1, w: 2, h: 1, fill: { color: "22C55E" } });
	s2.addImage({ data: `image/png;base64,${PNG}`, x: 4, y: 1, w: 1, h: 1 });
	s2.addTable(
		[
			["A", "B"],
			["1", "2"],
		],
		{ x: 1, y: 3, w: 4, colW: [2, 2], fontSize: 14 },
	);
	return (await p.write({ outputType: "nodebuffer" })) as Buffer;
}

describe("pptxToSlides", () => {
	let deck: ImportedDeck;
	beforeAll(async () => {
		deck = pptxToSlides(await fixture());
	});

	it("reads the presentation: size, slides in order, title and author", () => {
		expect(deck.width).toBe(12192000);
		expect(deck.height).toBe(6858000);
		expect(deck.slides.map((s) => s.index)).toEqual([1, 2]);
		expect(deck).toMatchObject({ title: "Fixture", author: "Astlide" });
	});

	it("keeps text as text, escaped, with its style", () => {
		const html = deck.slides[0]?.html ?? "";
		expect(deck.slides[0]?.title).toBe("Imported title");
		expect(html).toContain(">Imported title<");
		expect(html).toContain("Second &lt;point&gt; &amp; more");
		expect(html).toContain("color:#dc2626");
		// 20 pt on a 13.333 in wide slide scaled to 1920 px: 20 × 12700 × (1920 / 12192000) = 40 px.
		expect(html).toContain("font-size:40px");
	});

	it("places the title placeholder from its master, in master style", () => {
		const html = deck.slides[0]?.html ?? "";
		// x 0.5 in → 72 px, y 0.4 in → 57.6 px.
		expect(html).toMatch(/left:72px;top:57\.6px;width:1728px;height:144px/);
		expect(html).toMatch(/font-weight:700;color:#1e3a8a">Imported title/);
	});

	it("draws master artwork under the slide's shapes", () => {
		expect(deck.slides[0]?.html).toContain("background:#1e3a8a");
	});

	it("carries notes as paragraphs", () => {
		expect(deck.slides[0]?.notes).toBe("Line one\n\nLine two");
	});

	it("converts backgrounds, shapes, pictures and tables", () => {
		const html = deck.slides[1]?.html ?? "";
		expect(html).toContain("background:#0f172a");
		expect(html).toContain("border-radius:50%");
		expect(html).toMatch(/<img src="data:image\/png;base64,/);
		expect(html).toMatch(
			/<table[^>]*>.*<colgroup><col style="width:288px"><col style="width:288px"><\/colgroup>/s,
		);
	});

	it("hands pictures to a media callback when given", async () => {
		const files: string[] = [];
		const withFiles = pptxToSlides(await fixture(), {
			media: (f) => {
				files.push(f.type);
				return `/assets/${f.name}`;
			},
		});
		expect(files).toContain("image/png");
		expect(withFiles.slides[1]?.html).toMatch(/<img src="\/assets\/[^"]+\.png"/);
	});

	it("rejects files that aren't PowerPoint", () => {
		expect(() => pptxToSlides(Buffer.from("not a zip"))).toThrow(/ZIP/);
	});
});

describe("readZip", () => {
	it("reads stored and deflated entries", async () => {
		const files = readZip(await fixture());
		expect(files.get("ppt/presentation.xml")?.toString("utf-8")).toContain("p:presentation");
		expect([...files.keys()].some((k) => k.endsWith("/"))).toBe(false);
	});
});

describe("colors", () => {
	const ctx = {
		theme: { accent1: "4472c4", lt1: "ffffff", dk1: "000000" },
		map: { bg1: "lt1", tx1: "dk1" },
	};
	it("resolves scheme colors through the color map, with modifiers", () => {
		expect(colorOf(parseXml('<a:schemeClr val="tx1"/>'), ctx)).toEqual({ hex: "000000", alpha: 1 });
		expect(
			colorOf(parseXml('<a:schemeClr val="accent1"><a:alpha val="50000"/></a:schemeClr>'), ctx),
		).toEqual({
			hex: "4472c4",
			alpha: 0.5,
		});
		// lumMod 50% darkens to half the lightness.
		expect(
			colorOf(parseXml('<a:srgbClr val="ffffff"><a:lumMod val="50000"/></a:srgbClr>'), ctx)?.hex,
		).toBe("808080");
	});
});

describe("fontFromEot", () => {
	it("gets the font back out of an EOT (as PowerPoint embeds it)", () => {
		// A minimal sfnt: OS/2, head and name tables are enough for toEot.
		const font = Buffer.alloc(12 + 3 * 16 + 86 + 54 + 6);
		font.writeUInt32BE(0x00010000, 0);
		font.writeUInt16BE(3, 4);
		const tables: [string, number, number][] = [
			["OS/2", 60, 86],
			["head", 146, 54],
			["name", 200, 6],
		];
		tables.forEach(([tag, offset, length], i) => {
			font.write(tag, 12 + i * 16, "latin1");
			font.writeUInt32BE(offset, 12 + i * 16 + 8);
			font.writeUInt32BE(length, 12 + i * 16 + 12);
		});
		font.writeUInt16BE(6, 200 + 4);
		expect(fontFromEot(toEot(font))?.equals(font)).toBe(true);
		expect(fontFromEot(Buffer.from("nope"))).toBeNull();
	});
});
