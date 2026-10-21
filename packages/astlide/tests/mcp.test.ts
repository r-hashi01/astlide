import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FontRegistry, layoutPage } from "@astlide/engine";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import PptxGenJS from "pptxgenjs";
import { beforeAll, describe, expect, it } from "vitest";
import { checkSlide, siteView } from "../src/mcp/check";
import { importPptx, readPptx } from "../src/mcp/import";
import { exportArgs, outputDir } from "../src/mcp/render";
import { createServer } from "../src/mcp/server-def";
import { templateLayouts } from "../src/mcp/template";

/** A template: a title slide layout and a title-and-content layout with a slide number. */
async function template(): Promise<Buffer> {
	const p = new PptxGenJS();
	p.layout = "LAYOUT_WIDE";
	p.theme = { headFontFace: "Georgia", bodyFontFace: "Helvetica" };
	p.defineSlideMaster({
		title: "Title Slide",
		background: { color: "0F1F3D" },
		objects: [
			{
				placeholder: {
					options: { name: "title", type: "title", x: 0.5, y: 2, w: 10, h: 1.5 },
					text: "",
				},
			},
		],
	});
	p.defineSlideMaster({
		title: "Title and Content",
		objects: [
			{
				placeholder: {
					options: { name: "title", type: "title", x: 0.5, y: 0.5, w: 12, h: 1 },
					text: "",
				},
			},
			{
				placeholder: {
					options: { name: "body", type: "body", x: 0.5, y: 1.75, w: 12, h: 5 },
					text: "",
				},
			},
		],
		slideNumber: { x: 12.3, y: 7, w: 0.75, h: 0.4 },
	});
	p.addSlide({ masterName: "Title Slide" });
	return (await p.write({ outputType: "nodebuffer" })) as Buffer;
}

/** A deck: a title, bullets (two levels), a numbered item, notes; a table on slide 2. */
async function deck(): Promise<Buffer> {
	const p = new PptxGenJS();
	p.layout = "LAYOUT_WIDE";
	p.title = "Quarterly";
	p.defineSlideMaster({
		title: "BRAND",
		objects: [
			{
				placeholder: {
					options: { name: "title", type: "title", x: 0.5, y: 0.4, w: 12, h: 1 },
					text: "",
				},
			},
		],
	});
	const s1 = p.addSlide({ masterName: "BRAND" });
	s1.addText("Results", { placeholder: "title" });
	s1.addText(
		[
			{ text: "Revenue up", options: { bullet: true, breakLine: true } },
			{ text: "In every region", options: { bullet: true, indentLevel: 1, breakLine: true } },
			{ text: "Costs flat", options: { bullet: { type: "number" } } },
		],
		{ x: 0.5, y: 1.6, w: 6, h: 3, fontSize: 20 },
	);
	s1.addNotes("Mention the new office");
	const s2 = p.addSlide();
	s2.addTable(
		[
			[{ text: "Region" }, { text: "Growth" }],
			[{ text: "EMEA" }, { text: "12%" }],
		],
		{ x: 1, y: 1, w: 4, colW: [2, 2] },
	);
	return (await p.write({ outputType: "nodebuffer" })) as Buffer;
}

/** A font every install has (KaTeX ships TrueType), for text tests. */
const FONT = join(
	createRequire(import.meta.url).resolve("katex/package.json"),
	"..",
	"dist",
	"fonts",
	"KaTeX_Main-Regular.ttf",
);

/** Lay out one 1920×1080 slide (padding 64px, overflow hidden, like Astlide's) and check it. */
function check(body: string, css = "") {
	const dir = mkdtempSync(join(tmpdir(), "astlide-mcp-"));
	const file = join(dir, "index.html");
	writeFileSync(
		file,
		`<html><head><style>body{font-family:T;font-size:40px;line-height:1.25}.slide{width:1920px;height:1080px;padding:64px;overflow:hidden;display:flex;flex-direction:column;position:relative}.slide-content{flex:1;display:flex;flex-direction:column;min-height:0}h1,p{margin:0}${css}</style></head><body><section class="slide"><div class="slide-content">${body}</div></section></body></html>`,
	);
	const fonts = new FontRegistry();
	fonts.add("T", 400, false, FONT);
	const [slide] = layoutPage(file, dir, fonts, { width: 1920, height: 1080, media: "screen" });
	if (!slide) throw new Error("no slide");
	return checkSlide(slide, 3);
}

describe("template_layouts", () => {
	let data: Buffer;
	beforeAll(async () => {
		data = await template();
	});

	it("lists layouts with their placeholders and the built-in layouts they stand for", () => {
		const t = templateLayouts(data);
		expect(t.size).toEqual({ width: 1920, height: 1080 });
		expect(t.fonts).toEqual({ heading: "Georgia", body: "Helvetica" });
		const title = t.layouts.find((l) => l.name === "Title Slide");
		const content = t.layouts.find((l) => l.name === "Title and Content");
		expect(title).toMatchObject({ id: "title-slide", hasTitle: true, bodyCount: 0 });
		expect(title?.aliases).toContain("cover");
		expect(content).toMatchObject({
			id: "title-and-content",
			hasTitle: true,
			bodyCount: 1,
			hasSlideNumber: true,
		});
		expect(content?.aliases).toContain("default");
		expect(t.aliases.cover).toBe("title-slide");
	});
});

describe("import_pptx", () => {
	let data: Buffer;
	beforeAll(async () => {
		data = await deck();
	});

	it("reads slides as Markdown with titles and notes", () => {
		const d = readPptx(data);
		expect(d.title).toBe("Quarterly");
		expect(d.slides).toHaveLength(2);
		const [s1, s2] = d.slides;
		expect(s1?.title).toBe("Results");
		expect(s1?.notes).toBe("Mention the new office");
		expect(s1?.html).toBeUndefined();
		expect(s1?.markdown).toBe(
			["# Results", "- Revenue up", "  - In every region", "1. Costs flat"].join("\n"),
		);
		expect(s2?.markdown).toBe(
			["| Region | Growth |", "| --- | --- |", "| EMEA | 12% |"].join("\n"),
		);
	});

	it("includes the HTML when asked", () => {
		expect(readPptx(data, true).slides[0]?.html).toContain("astlide-pptx");
	});

	it("writes an Astlide deck into a project", async () => {
		const root = mkdtempSync(join(tmpdir(), "astlide-mcp-project-"));
		mkdirSync(join(root, "src", "content", "decks"), { recursive: true });
		const file = join(root, "q3.pptx");
		writeFileSync(file, data);
		const r = await importPptx({ path: file, projectRoot: root, deck: "q3" });
		expect(r.written).toEqual({ dir: join("src", "content", "decks", "q3"), slides: 2 });
		const dir = join(root, "src", "content", "decks", "q3");
		expect(readdirSync(dir).sort()).toEqual(["01-results.html", "02-slide.html", "_config.json"]);
		expect(readFileSync(join(dir, "01-results.html"), "utf-8")).toContain('title: "Results"');
		await expect(importPptx({ path: file, projectRoot: root, deck: "q3" })).rejects.toThrow(
			/exists/,
		);
	}, 30_000);

	it("rejects files that aren't .pptx", async () => {
		await expect(importPptx({ path: "talk.key" })).rejects.toThrow(/\.pptx/);
	});

	it("refuses deck names that are paths, and touches nothing outside the decks folder", async () => {
		const outside = mkdtempSync(join(tmpdir(), "astlide-mcp-outside-"));
		const root = join(outside, "project");
		mkdirSync(join(root, "src", "content", "decks"), { recursive: true });
		const keep = join(outside, "keep");
		mkdirSync(keep);
		writeFileSync(join(keep, "precious.txt"), "x");
		const file = join(root, "q3.pptx");
		writeFileSync(file, data);
		for (const deck of ["../../../keep", "..", "a/b", ".hidden", "-rf", "x\\..\\y", ""])
			await expect(
				importPptx({ path: file, projectRoot: root, deck, force: true }),
			).rejects.toThrow(/bad deck name/);
		expect(readFileSync(join(keep, "precious.txt"), "utf-8")).toBe("x");
		expect(readdirSync(join(root, "src", "content", "decks"))).toEqual([]);
	});
});

describe("render_deck", () => {
	it("runs astlide export with the formats and output folder", () => {
		expect(
			exportArgs({ projectRoot: "/p", deck: "talk", formats: ["pptx", "pdf", "pptx"] }, "/p/out"),
		).toEqual(["export", "talk", "--pptx", "--pdf", "--out-dir", "/p/out"]);
		expect(
			exportArgs({ projectRoot: "/p", deck: "talk", formats: ["pdf"], build: false }, "/o"),
		).toContain("--no-build");
		expect(() => exportArgs({ projectRoot: "/p", deck: "talk", formats: [] }, "/o")).toThrow();
	});

	it("keeps the output folder inside the project", () => {
		expect(outputDir("/p")).toBe(join("/p", "exports"));
		expect(outputDir("/p", "out/slides")).toBe(join("/p", "out", "slides"));
		expect(outputDir("/p", "/p/out")).toBe(join("/p", "out"));
		expect(outputDir("/p", "..data")).toBe(join("/p", "..data"));
		for (const bad of ["..", "../x", "out/../../x", "/tmp/x", "/p-other/x"])
			expect(() => outputDir("/p", bad), bad).toThrow(/inside the project/);
	});
});

describe("check_deck", () => {
	it("finds nothing on a slide that fits", () => {
		expect(check("<h1>Short title</h1><p>One line of text.</p>")).toEqual([]);
	});

	it("reports text cut off by a fixed-height box with overflow hidden", () => {
		const long = "words that keep going ".repeat(20);
		const issues = check(
			`<h1>Title</h1><div class="card"><p>${long}</p></div>`,
			".card{width:600px;height:100px;overflow:hidden}",
		);
		const clipped = issues.find((i) => i.kind === "text-clipped");
		expect(clipped).toMatchObject({ slide: 3, slideTitle: "Title", container: "div.card" });
		expect(clipped?.text).toMatch(/^words that keep going/);
		expect(clipped?.overflow.bottom).toBeGreaterThan(100);
		expect(clipped?.amount).toBe(clipped?.overflow.bottom);
		expect(clipped?.message).toMatch(
			/^Slide 3 "Title": text "words that keep going.*" \(p\) is cut off by div\.card \(\d+px bottom\)$/,
		);
	});

	it("reports text spilling out of a fixed-height box", () => {
		const issues = check(
			'<div class="box"><p>A sentence long enough to need a few lines in a narrow box like this one.</p></div>',
			".box{width:300px;height:50px}",
		);
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ kind: "text-overflow", container: "div.box" });
		expect(issues[0]?.overflow.bottom).toBeGreaterThan(50);
	});

	it("reports content running off the bottom of the slide, once for many lines", () => {
		const items = Array.from({ length: 30 }, (_, i) => `<p>Point ${i + 1}</p>`).join("");
		const issues = check(`<h1>Agenda</h1><div class="list">${items}</div>`, ".list{flex-shrink:0}");
		// The list's text is reported (with its words), not the box around it.
		expect(issues.filter((i) => i.kind.startsWith("box"))).toEqual([]);
		const text = issues.filter((i) => i.kind === "text-clipped");
		expect(text).toHaveLength(1);
		expect(text[0]?.container).toBe("slide");
		expect(text[0]?.text).toMatch(/^Point \d+ … Point 30$/);
		expect(text[0]?.message).toMatch(
			/text blocks, "Point \d+" to "Point 30", are cut off by the slide/,
		);
	});

	it("reports a picture cut off by the slide", () => {
		const issues = check(
			'<h1>Photo</h1><div class="figure"><img src="data:," width="600" height="1300"></div>',
			".figure{flex-shrink:0}img{display:block}",
		);
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({
			kind: "box-clipped",
			element: "div.figure",
			container: "slide",
		});
		expect(issues[0]?.overflow.bottom).toBeGreaterThan(0);
	});
});

describe("siteView", () => {
	it("resolves a page's links under Astro's base", () => {
		const dist = mkdtempSync(join(tmpdir(), "astlide-mcp-dist-"));
		mkdirSync(join(dist, "_astro"));
		mkdirSync(join(dist, "talk", "all"), { recursive: true });
		writeFileSync(join(dist, "_astro", "a.css"), "body{}");
		const page = join(dist, "talk", "all", "index.html");
		writeFileSync(page, '<link rel="stylesheet" href="/my/repo/_astro/a.css">');
		const view = siteView(page, dist);
		expect(view.dir).not.toBe(dist);
		expect(readFileSync(join(view.dir, "my", "repo", "_astro", "a.css"), "utf-8")).toBe("body{}");
		view.dispose();
		expect(existsSync(view.dir)).toBe(false);
		expect(existsSync(join(dist, "_astro", "a.css"))).toBe(true);
		writeFileSync(page, '<link rel="stylesheet" href="/_astro/a.css">');
		expect(siteView(page, dist).dir).toBe(dist);
	});

	it("links nothing outside its temporary folder", () => {
		const dist = mkdtempSync(join(tmpdir(), "astlide-mcp-dist-"));
		mkdirSync(join(dist, "_astro"));
		writeFileSync(join(dist, "_astro", "a.css"), "body{}");
		const page = join(dist, "index.html");
		for (const href of [
			"/../../escape/_astro/a.css",
			"/./x/_astro/a.css",
			"/a\\..\\b/_astro/a.css",
		]) {
			writeFileSync(page, `<link rel="stylesheet" href="${href}">`);
			expect(siteView(page, dist).dir, href).toBe(dist);
		}
	});
});

describe("MCP server", () => {
	it("serves the four tools and answers a call", async () => {
		const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
		await createServer().connect(serverSide);
		const client = new Client({ name: "test", version: "0" });
		await client.connect(clientSide);
		const { tools } = await client.listTools();
		expect(tools.map((t) => t.name).sort()).toEqual([
			"check_deck",
			"import_pptx",
			"render_deck",
			"template_layouts",
		]);
		const dir = mkdtempSync(join(tmpdir(), "astlide-mcp-"));
		const file = join(dir, "brand.potx");
		writeFileSync(file, await template());
		const r = await client.callTool({
			name: "template_layouts",
			arguments: { templatePath: file },
		});
		expect(r.isError).toBeFalsy();
		expect(JSON.stringify(r.structuredContent)).toContain("title-and-content");
		const bad = await client.callTool({
			name: "check_deck",
			arguments: { projectRoot: dir, deck: "nope" },
		});
		const check = tools.find((t) => t.name === "check_deck");
		expect(check?.annotations?.readOnlyHint).toBe(false);
		expect(bad.isError).toBe(true);
		expect(existsSync(join(dir, "dist"))).toBe(false);
		await client.close();
	});
});
