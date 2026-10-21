import { deflateRawSync } from "node:zlib";
import PptxGenJS from "pptxgenjs";
import { beforeAll, describe, expect, it } from "vitest";
import { toEot } from "../src/cli/pptx/eot";
import { ZipWriter } from "../src/cli/pptx/ooxml-writer";
import { colorOf } from "../src/pptx/color";
import { fontFromEot, type ImportedDeck, pptxToSlides, safeFontName } from "../src/pptx/import";
import { pptxToTemplate, templateCss } from "../src/pptx/template";
import { parseXml } from "../src/pptx/xml";
import { readZip, ZIP_LIMITS } from "../src/pptx/zip";

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

/** A copy of a .pptx with some parts replaced (text in, text out). */
function patched(
	pptx: Buffer,
	edit: (name: string, text: string) => string,
	extra: Record<string, Buffer> = {},
): Buffer {
	const files = readZip(pptx);
	const zip = new ZipWriter();
	for (const name of files.keys()) {
		const data = files.get(name) as Buffer;
		zip.add(name, /\.(xml|rels)$/.test(name) ? edit(name, data.toString("utf-8")) : data);
	}
	for (const [name, data] of Object.entries(extra)) zip.add(name, data);
	return zip.toBuffer();
}

/** A minimal sfnt wrapped as an EOT, as PowerPoint embeds fonts. */
function eotFont(): Buffer {
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
	return toEot(font);
}

describe("untrusted files", () => {
	it("keeps font names to safe characters", () => {
		expect(safeFontName("Calibri Light")).toBe("Calibri Light");
		expect(safeFontName("游ゴシック")).toBe("游ゴシック");
		expect(safeFontName("Noto Sans JP")).toBe("Noto Sans JP");
		expect(safeFontName("x</style><script>alert(1)</script>")).toBe("xstylescriptalert1script");
		expect(safeFontName("a';}body{x:y")).toBe("abodyxy");
		expect(safeFontName("<>{}")).toBeUndefined();
	});

	it("can't break out of the style element with an embedded font's name", async () => {
		const evil = "x&lt;/style&gt;&lt;img src=x onerror=alert(1)&gt;";
		const pptx = patched(
			await fixture(),
			(name, text) =>
				name === "ppt/presentation.xml"
					? text.replace(
							"</p:sldIdLst>",
							`</p:sldIdLst><p:embeddedFontLst><p:embeddedFont><p:font typeface="${evil}"/><p:regular r:id="rIdEvilFont"/></p:embeddedFont></p:embeddedFontLst>`,
						)
					: name === "ppt/_rels/presentation.xml.rels"
						? text.replace(
								"</Relationships>",
								'<Relationship Id="rIdEvilFont" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font1.fntdata"/></Relationships>',
							)
						: text,
			{ "ppt/fonts/font1.fntdata": eotFont() },
		);
		const deck = pptxToSlides(pptx, { media: (f) => `/assets/${f.name.replace(/[^\w.-]/g, "")}` });
		const html = deck.slides[0]?.html ?? "";
		expect(html).toContain("@font-face{font-family:'xstyleimg srcx onerroralert1'");
		expect(html).not.toContain("<img src=x");
		expect(html.match(/<\/style>/g)?.length).toBe(2); // the reset and the font rules, nothing else
	});

	it("only takes real colors from a template's theme into its CSS", async () => {
		const pptx = patched(await fixture(), (name, text) =>
			/ppt\/theme\/theme\d+\.xml$/.test(name)
				? text.replace(
						/<a:lt1>[\s\S]*?<\/a:lt1>/,
						'<a:lt1><a:srgbClr val="fff}*{display:none}x{"/></a:lt1>',
					)
				: text,
		);
		const template = pptxToTemplate(pptx);
		expect(template.colors.lt1).toBeUndefined();
		const css = templateCss(template, "brand");
		expect(css).not.toContain("display:none");
		// The bad value is dropped: the default stands in.
		expect(css).toContain("--color-background:#ffffff");
	});

	it("reads each slide once, however often the file lists it", async () => {
		const pptx = patched(await fixture(), (name, text) => {
			if (name !== "ppt/presentation.xml") return text;
			const first = text.match(/<p:sldId [^>]*\/>/)?.[0] ?? "";
			return text.replace("</p:sldIdLst>", `${first.repeat(500)}</p:sldIdLst>`);
		});
		expect(pptxToSlides(pptx).slides).toHaveLength(2);
	});

	/** The fixture with `xml` added to slide 1's shapes. */
	async function withShapes(xml: string): Promise<Buffer> {
		return patched(await fixture(), (name, text) =>
			name === "ppt/slides/slide1.xml" ? text.replace("</p:spTree>", `${xml}</p:spTree>`) : text,
		);
	}
	/** A text box with one paragraph, `pPr` / `rPr` / `spPr` children as given. */
	const textBox = (pPr: string, spPr = "", text = "item") =>
		`<p:sp><p:nvSpPr><p:cNvPr id="900" name="t"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm>${spPr}</p:spPr><p:txBody><a:bodyPr/><a:p><a:pPr>${pPr}</a:pPr><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;

	it("keeps numbered lists within PowerPoint's range", async () => {
		const html = async (startAt: string) =>
			pptxToSlides(
				await withShapes(textBox(`<a:buAutoNum type="romanUcPeriod" startAt="${startAt}"/>`)),
			).slides[0]?.html ?? "";
		expect(await html("4")).toContain("IV.");
		// Past 3999 there are no roman numerals: plain numbers.
		expect(await html("5000")).toContain("5000.");
		expect(await html("1e12")).toContain("32767.");
		expect(await html("Infinity")).toContain("I.");
	});

	it("reads each embedded font once, and only so many", async () => {
		const fonts = Array.from(
			{ length: 2000 },
			(_, i) =>
				`<p:embeddedFont><p:font typeface="F${i % 100}"/><p:regular r:id="rIdF"/></p:embeddedFont>`,
		).join("");
		const pptx = patched(
			await fixture(),
			(name, text) =>
				name === "ppt/presentation.xml"
					? text.replace(
							"</p:sldIdLst>",
							`</p:sldIdLst><p:embeddedFontLst>${fonts}</p:embeddedFontLst>`,
						)
					: name === "ppt/_rels/presentation.xml.rels"
						? text.replace(
								"</Relationships>",
								'<Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font1.fntdata"/></Relationships>',
							)
						: text,
			{ "ppt/fonts/font1.fntdata": eotFont() },
		);
		let stored = 0;
		const deck = pptxToSlides(pptx, {
			media: (f) => {
				if (f.type === "font/ttf") stored++;
				return `/assets/${f.name}`;
			},
		});
		expect(stored).toBe(1);
		expect(deck.slides[0]?.html.match(/@font-face/g)?.length).toBe(32);
	});

	it("refuses oversized XML parts before parsing them", async () => {
		const huge = await withShapes(`<a:ext uri="x">${" ".repeat(33 * 1024 * 1024)}</a:ext>`);
		expect(() => pptxToSlides(huge)).toThrow(/too large/);
		const many = await withShapes("<a:x/>".repeat(600_000));
		expect(() => pptxToSlides(many)).toThrow(/too many elements/);
	});

	it("doesn't trip over names like constructor in the file", async () => {
		const pptx = await withShapes(
			textBox(
				'<a:buFont typeface="Wingdings"/><a:buChar char="constructor"/>',
				'<a:solidFill><a:prstClr val="constructor"/></a:solidFill><a:ln w="12700"><a:solidFill><a:schemeClr val="constructor"/></a:solidFill><a:prstDash val="constructor"/></a:ln>',
			) + textBox("", '<a:solidFill><a:schemeClr val="__proto__"/></a:solidFill>'),
		);
		expect(pptxToSlides(pptx).slides[0]?.html).toContain("item");
	});

	it("refuses XML nested deeper than the helpers can walk", async () => {
		const depth = 100_000;
		const pptx = patched(await fixture(), (name, text) =>
			/^ppt\/slides\/slide1\.xml$/.test(name)
				? text.replace(
						"</p:spTree>",
						`${"<p:grpSp>".repeat(depth)}${"</p:grpSp>".repeat(depth)}</p:spTree>`,
					)
				: text,
		);
		expect(() => pptxToSlides(pptx)).toThrow(/nested too deeply/);
	});

	it("matches placeholders against an index, not shape by shape", async () => {
		// 20 000 placeholders on slide 1 and its layout (BRAND): quadratic matching takes far longer.
		const shapes = (n: number) =>
			Array.from(
				{ length: n },
				(_, i) =>
					`<p:sp><p:nvSpPr><p:cNvPr id="${i + 100}" name="p${i}"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="${i + 100}"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>`,
			).join("");
		const pptx = patched(await fixture(), (name, text) =>
			/^ppt\/(slides\/slide1|slideLayouts\/slideLayout2)\.xml$/.test(name)
				? text.replace("</p:spTree>", `${shapes(20_000)}</p:spTree>`)
				: text,
		);
		const started = performance.now();
		pptxToSlides(pptx);
		expect(performance.now() - started).toBeLessThan(4000);
	});
});

describe("readZip limits", () => {
	/** A one-entry archive whose central directory claims `declared` bytes. */
	function archive(data: Buffer, declared: number, copies = 1): Buffer {
		const compressed = deflateRawSync(data);
		const name = Buffer.from("a.xml");
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(8, 8);
		local.writeUInt32LE(compressed.length, 18);
		local.writeUInt32LE(declared, 22);
		local.writeUInt16LE(name.length, 26);
		const central: Buffer[] = [];
		for (let i = 0; i < copies; i++) {
			const c = Buffer.alloc(46);
			c.writeUInt32LE(0x02014b50, 0);
			c.writeUInt16LE(8, 10);
			c.writeUInt32LE(compressed.length, 20);
			c.writeUInt32LE(declared, 24);
			c.writeUInt16LE(name.length + 1, 28);
			c.writeUInt32LE(0, 42);
			central.push(c, Buffer.concat([Buffer.from(`${i}`), name]));
		}
		const cd = Buffer.concat(central);
		const body = Buffer.concat([local, name, compressed]);
		const end = Buffer.alloc(22);
		end.writeUInt32LE(0x06054b50, 0);
		end.writeUInt16LE(copies, 8);
		end.writeUInt16LE(copies, 10);
		end.writeUInt32LE(cd.length, 12);
		end.writeUInt32LE(body.length, 16);
		return Buffer.concat([body, cd, end]);
	}

	it("inflates no more than an entry declares", () => {
		const bomb = archive(Buffer.alloc(64 * 1024 * 1024), 100);
		const files = readZip(bomb);
		expect(() => files.get("0a.xml")).toThrow();
	});

	it("refuses entries over the size limit without inflating them", () => {
		const files = readZip(archive(Buffer.from("x"), ZIP_LIMITS.entryBytes + 1));
		expect(() => files.get("0a.xml")).toThrow(/too large/);
	});

	it("refuses entries that share data", () => {
		expect(() => readZip(archive(Buffer.from("<x/>"), 4, 3))).toThrow(/share data/);
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
