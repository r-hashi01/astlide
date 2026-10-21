import { readFileSync } from "node:fs";
import PptxGenJS from "pptxgenjs";
import { beforeAll, describe, expect, it } from "vitest";
import { type PptxTemplate, pptxToTemplate, templateCss } from "../src/pptx/template";

/** A template as pptxgenjs writes one: untyped layouts, named like PowerPoint's. */
async function fixture(): Promise<Buffer> {
	const p = new PptxGenJS();
	p.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 in → 144 px per inch on 1920 × 1080
	p.theme = { headFontFace: "Georgia", bodyFontFace: "Helvetica" };
	p.defineSlideMaster({
		title: "Title Slide",
		background: { color: "0F1F3D" },
		objects: [
			{
				placeholder: {
					options: { name: "title", type: "title", x: 0.5, y: 2, w: 10, h: 1.5, fontSize: 54 },
					text: "",
				},
			},
			{
				placeholder: {
					options: { name: "sub", type: "body", x: 0.5, y: 3.75, w: 10, h: 1, fontSize: 24 },
					text: "",
				},
			},
		],
	});
	p.defineSlideMaster({
		title: "Title and Content",
		background: { color: "FFFFFF" },
		objects: [
			{ rect: { x: 0, y: 0, w: "100%", h: 0.25, fill: { color: "F97316" } } },
			{
				placeholder: {
					options: {
						name: "title",
						type: "title",
						x: 0.5,
						y: 0.5,
						w: 12,
						h: 1,
						fontSize: 36,
						bold: true,
						color: "0F1F3D",
						align: "left",
					},
					text: "",
				},
			},
			{
				placeholder: {
					options: { name: "body", type: "body", x: 0.5, y: 1.75, w: 12, h: 5, fontSize: 20 },
					text: "",
				},
			},
		],
		slideNumber: { x: 12.3, y: 7, w: 0.75, h: 0.4, fontSize: 12, color: "64748B" },
	});
	p.defineSlideMaster({
		title: "Two Content",
		objects: [
			{
				placeholder: {
					options: { name: "title", type: "title", x: 0.5, y: 0.5, w: 12, h: 1 },
					text: "",
				},
			},
			{
				placeholder: {
					options: { name: "right", type: "body", x: 7, y: 1.75, w: 5.5, h: 5 },
					text: "",
				},
			},
			{
				placeholder: {
					options: { name: "left", type: "body", x: 0.5, y: 1.75, w: 5.5, h: 5 },
					text: "",
				},
			},
		],
	});
	p.addSlide({ masterName: "Title Slide" });
	return (await p.write({ outputType: "nodebuffer" })) as Buffer;
}

describe("pptxToTemplate", () => {
	let t: PptxTemplate;
	beforeAll(async () => {
		t = pptxToTemplate(await fixture());
	});
	const layout = (id: string) => {
		const l = t.layouts.find((l) => l.id === id);
		if (!l) throw new Error(`no layout ${id}`);
		return l;
	};

	it("reads the theme fonts and every layout, named as slugs", () => {
		expect(t.fonts).toEqual({ heading: "Georgia", body: "Helvetica" });
		expect(t.layouts.map((l) => l.id)).toEqual(
			expect.arrayContaining(["title-slide", "title-and-content", "two-content"]),
		);
	});

	it("maps built-in layouts to the template's by name when layouts aren't typed", () => {
		expect(t.aliases).toMatchObject({
			cover: "title-slide",
			default: "title-and-content",
			"two-column": "two-content",
		});
	});

	it("finds the title, body and slide-number placeholders with their text style", () => {
		const l = layout("title-and-content");
		expect(l.title).toMatchObject({ left: 72, top: 72, width: 1728, height: 144 });
		// 36 pt on a 13.333 in slide drawn 1920 px wide: 36 × 12700 × 1920 / 12192000 = 72 px.
		expect(l.title?.css).toContain("font-size:72px");
		expect(l.title?.css).toContain("font-weight:700");
		expect(l.title?.css).toContain("color:#0f1f3d");
		expect(l.title?.css).toContain("text-align:left");
		expect(l.body).toHaveLength(1);
		expect(l.body[0]).toMatchObject({ left: 72, top: 252 });
		expect(l.slideNumber).toBeDefined();
	});

	it("draws the layout's background and artwork, not its placeholders", () => {
		const art = layout("title-and-content").art;
		expect(art).toContain("background:#ffffff");
		expect(art).toContain("background:#f97316");
		expect(art).not.toMatch(/Click to edit|font-size:72px/);
	});

	it("orders side-by-side placeholders left to right", () => {
		const [a, b] = layout("two-content").body;
		expect(a?.left).toBe(72);
		expect(b?.left).toBe(1008);
	});
});

describe("templateCss", () => {
	let css: string;
	beforeAll(async () => {
		css = templateCss(pptxToTemplate(await fixture()), "brand");
	});

	it("sets the theme's variables", () => {
		expect(css).toMatch(/\[data-theme="brand"\]\{[^}]*--font-heading:"Georgia"/);
		expect(css).toMatch(/--font-size-h1:72px/);
	});

	it("puts the content in the body placeholder and the first heading in the title", () => {
		const s = '[data-theme="brand"] .slide.astlide-tpl.astlide-tpl-title-and-content';
		expect(css).toContain(`${s}>.slide-content{position:absolute;left:72px;top:252px;width:1728px`);
		// The title is placed relative to the body box: 72 − 252 = −180.
		expect(css).toContain(
			`${s}>.slide-content>:is(h1,h2):first-child{position:absolute;left:0px;top:-180px`,
		);
		expect(css).toContain(`${s} .astlide-tpl-number{`);
	});

	it("lays two placeholders out as columns with the template's gap", () => {
		expect(css).toMatch(
			/astlide-tpl-two-content>\.slide-content\{[^}]*flex-direction:row[^}]*gap:144px/,
		);
	});
});

describe("Office theme files", () => {
	it("reads a .thmx (theme manager → presentation)", () => {
		// A real Office theme, when this machine has PowerPoint.
		const path =
			"/Applications/Microsoft PowerPoint.app/Contents/Resources/Office Themes/Office 2013 - 2022 Theme-new.thmx";
		let data: Buffer;
		try {
			data = readFileSync(path);
		} catch {
			return;
		}
		const t = pptxToTemplate(data);
		expect(t.aliases).toMatchObject({ cover: "title-slide", section: "section-header" });
	});
});

describe("untrusted templates", () => {
	it("reads each master and layout once, however often the file lists them", async () => {
		const { readZip } = await import("../src/pptx/zip");
		const { ZipWriter } = await import("../src/cli/pptx/ooxml-writer");
		const original = pptxToTemplate(await fixture());
		const files = readZip(await fixture());
		const zip = new ZipWriter();
		for (const name of files.keys()) {
			let data: Buffer | string = files.get(name) as Buffer;
			if (name === "ppt/presentation.xml") {
				const text = data.toString("utf-8");
				const first = text.match(/<p:sldMasterId [^>]*\/>/)?.[0] ?? "";
				data = text.replace("</p:sldMasterIdLst>", `${first.repeat(5000)}</p:sldMasterIdLst>`);
			} else if (/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name)) {
				const text = data.toString("utf-8");
				const first = text.match(/<p:sldLayoutId [^>]*\/>/)?.[0] ?? "";
				data = text.replace("</p:sldLayoutIdLst>", `${first.repeat(100_000)}</p:sldLayoutIdLst>`);
			}
			zip.add(name, data);
		}
		const started = performance.now();
		const template = pptxToTemplate(zip.toBuffer());
		expect(performance.now() - started).toBeLessThan(10_000);
		expect(template.layouts.map((l) => l.id)).toEqual(original.layouts.map((l) => l.id));
	});
});
