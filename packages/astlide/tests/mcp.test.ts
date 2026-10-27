import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { FontRegistry, layoutPage } from "@astlide/core/engine";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import PptxGenJS from "pptxgenjs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { checkSlide, siteView } from "../src/mcp/check";
import { importPptx, readPptx } from "../src/mcp/import";
import {
	astlideArgs,
	astlideCli,
	childEnv,
	deckDir,
	explicitRoots,
	isBroadFolder,
	MIN_PROJECT_CLI,
	projectRootWithin,
} from "../src/mcp/project";
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

	it("names the deck itself when none is given", async () => {
		const root = mkdtempSync(join(tmpdir(), "astlide-mcp-project-"));
		mkdirSync(join(root, "src", "content", "decks"), { recursive: true });
		const file = join(root, "Q3 Results.pptx");
		writeFileSync(file, data);
		const r = await importPptx({ path: file, projectRoot: root });
		expect(r.written?.dir).toBe(join("src", "content", "decks", "q3-results"));
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
		).toEqual(["export", "--pptx", "--pdf", "--out-dir", "/p/out", "--", "talk"]);
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

	it("doesn't follow a symlinked output folder out of the project", () => {
		const root = mkdtempSync(join(tmpdir(), "astlide-mcp-out-"));
		const elsewhere = mkdtempSync(join(tmpdir(), "astlide-mcp-elsewhere-"));
		symlinkSync(elsewhere, join(root, "exports"));
		expect(() => outputDir(root)).toThrow(/inside the project/);
		expect(() => outputDir(root, "exports/deep")).toThrow(/inside the project/);
		mkdirSync(join(root, "out"));
		expect(outputDir(root, "out")).toBe(join(root, "out"));
	});

	it("passes the deck after --, and --cwd before it", () => {
		expect(astlideArgs("/p", ["export", "--pptx", "--", "-o"])).toEqual([
			"export",
			"--cwd",
			"/p",
			"--pptx",
			"--",
			"-o",
		]);
	});
});

describe("projects", () => {
	it("refuses deck names that look like options or paths", () => {
		const root = mkdtempSync(join(tmpdir(), "astlide-mcp-decks-"));
		mkdirSync(join(root, "src", "content", "decks", "-o"), { recursive: true });
		for (const name of ["-o", "--no-build", "../x", ".hidden"])
			expect(() => deckDir(root, name), name).toThrow(/bad deck name/);
	});

	it("only works in projects inside the allowed folders, symlinks resolved", () => {
		const allowed = mkdtempSync(join(tmpdir(), "astlide-mcp-allowed-"));
		const outside = mkdtempSync(join(tmpdir(), "astlide-mcp-other-"));
		for (const dir of [join(allowed, "p"), outside])
			mkdirSync(join(dir, "src", "content", "decks"), { recursive: true });
		symlinkSync(outside, join(allowed, "link"));
		expect(projectRootWithin(join(allowed, "p"), [allowed])).toBe(realpathSync(join(allowed, "p")));
		expect(() => projectRootWithin(outside, [allowed])).toThrow(/outside the folders/);
		expect(() => projectRootWithin(join(allowed, "link"), [allowed])).toThrow(
			/outside the folders/,
		);
	});

	it("gives child processes no secrets", () => {
		const env = childEnv({
			PATH: "/bin",
			HOME: "/h",
			GITHUB_TOKEN: "t",
			ASTLIDE_API_KEY: "k",
			AWS_SECRET_ACCESS_KEY: "s",
			ASTLIDE_PUBLIC_NETWORK_ONLY: "1",
			ASTLIDE_EXPORT_BUILD: "/p/dist",
			ASTLIDE_NOTES: "public",
		});
		expect(env).toMatchObject({ PATH: "/bin", HOME: "/h", ASTLIDE_PUBLIC_NETWORK_ONLY: "1" });
		for (const key of [
			"GITHUB_TOKEN",
			"ASTLIDE_API_KEY",
			"AWS_SECRET_ACCESS_KEY",
			"ASTLIDE_EXPORT_BUILD",
			"ASTLIDE_NOTES",
		])
			expect(env[key], key).toBeUndefined();
	});

	it("doesn't import through a symlinked decks folder", async () => {
		const outside = mkdtempSync(join(tmpdir(), "astlide-mcp-linked-"));
		const root = join(outside, "project");
		const real = join(outside, "real-decks");
		mkdirSync(join(real, "q3"), { recursive: true });
		writeFileSync(join(real, "q3", "keep.txt"), "x");
		mkdirSync(join(root, "src", "content"), { recursive: true });
		symlinkSync(real, join(root, "src", "content", "decks"));
		const file = join(root, "q3.pptx");
		writeFileSync(file, await template());
		await expect(
			importPptx({ path: file, projectRoot: root, deck: "q3", force: true }),
		).rejects.toThrow(/symlink/);
		expect(readFileSync(join(real, "q3", "keep.txt"), "utf-8")).toBe("x");
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
		const dir = mkdtempSync(join(tmpdir(), "astlide-mcp-"));
		const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
		await createServer({ allowedRoots: [dir] }).connect(serverSide);
		const client = new Client({ name: "test", version: "0" });
		await client.connect(clientSide);
		const { tools } = await client.listTools();
		expect(tools.map((t) => t.name).sort()).toEqual([
			"check_deck",
			"import_pptx",
			"render_deck",
			"template_layouts",
		]);
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
		expect(check?.description).toMatch(/runs the project's own code/);
		expect(tools.find((t) => t.name === "import_pptx")?.annotations?.destructiveHint).toBe(true);
		expect(bad.isError).toBe(true);
		expect(existsSync(join(dir, "dist"))).toBe(false);
		await client.close();
	});

	it("works only on projects inside the client's roots", async () => {
		const allowed = realpathSync(mkdtempSync(join(tmpdir(), "astlide-mcp-root-")));
		const outside = mkdtempSync(join(tmpdir(), "astlide-mcp-elsewhere-"));
		for (const dir of [allowed, outside])
			mkdirSync(join(dir, "src", "content", "decks"), { recursive: true });
		const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
		// Without roots from the client, the default (here: nothing) would apply.
		await createServer({ allowedRoots: [] }).connect(serverSide);
		const client = new Client({ name: "test", version: "0" }, { capabilities: { roots: {} } });
		client.setRequestHandler(ListRootsRequestSchema, () => ({
			roots: [{ uri: pathToFileURL(allowed).href }],
		}));
		await client.connect(clientSide);
		const text = async (projectRoot: string) => {
			const r = await client.callTool({
				name: "check_deck",
				arguments: { projectRoot, deck: "nope" },
			});
			return (r.content as { text: string }[])[0]?.text ?? "";
		};
		expect(await text(outside)).toMatch(/outside the folders/);
		expect(await text(allowed)).toMatch(/no deck "nope"/);
		await client.close();
	});
});

describe("allowed folders", () => {
	afterEach(() => vi.restoreAllMocks());

	/** A project folder (with src/content/decks) in a fresh temp dir. */
	const project = (name: string) => {
		const dir = realpathSync(mkdtempSync(join(tmpdir(), `astlide-mcp-${name}-`)));
		mkdirSync(join(dir, "src", "content", "decks"), { recursive: true });
		return dir;
	};

	/** A connected client; `roots` (file paths) when the client offers MCP roots. */
	async function connect(options: Parameters<typeof createServer>[0], roots?: string[]) {
		const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
		await createServer(options).connect(serverSide);
		const client = new Client(
			{ name: "test", version: "0" },
			roots ? { capabilities: { roots: {} } } : undefined,
		);
		if (roots)
			client.setRequestHandler(ListRootsRequestSchema, () => ({
				roots: roots.map((r) => ({ uri: pathToFileURL(r).href })),
			}));
		await client.connect(clientSide);
		const check = async (projectRoot: string) => {
			const r = await client.callTool({
				name: "check_deck",
				arguments: { projectRoot, deck: "nope" },
			});
			return (r.content as { text: string }[])[0]?.text ?? "";
		};
		return { client, check };
	}

	it("counts the filesystem root and the home folder (or above it) as too broad", () => {
		const home = join(tmpdir(), "home", "me");
		expect(isBroadFolder("/", home)).toBe(true);
		expect(isBroadFolder(home, home)).toBe(true);
		expect(isBroadFolder(dirname(home), home)).toBe(true);
		expect(isBroadFolder(join(home, "work", "talks"), home)).toBe(false);
		expect(isBroadFolder(homedir())).toBe(true);
		// Shared temp folders too (anyone can put a project there) — not the folders inside them.
		expect(isBroadFolder(tmpdir(), home)).toBe(true);
		expect(isBroadFolder(mkdtempSync(join(tmpdir(), "astlide-mcp-specific-")), home)).toBe(false);
	});

	it("reads --root folders and ASTLIDE_MCP_ROOTS", () => {
		expect(
			explicitRoots(["--root", "/a", "--root=/b"], {
				ASTLIDE_MCP_ROOTS: ["/c", "/d"].join(delimiter),
			}),
		).toEqual(["/a", "/b", "/c", "/d"]);
		expect(() => explicitRoots(["--root"], {})).toThrow(/needs a folder/);
		// Empty (would mean the working directory) or a flag where the folder should be.
		expect(() => explicitRoots(["--root="], {})).toThrow(/needs a folder/);
		expect(() => explicitRoots(["--root", "--other"], {})).toThrow(/needs a folder/);
		// Empty entries in the variable are skipped, not taken as the working directory.
		expect(explicitRoots([], { ASTLIDE_MCP_ROOTS: `${delimiter}/a${delimiter}` })).toEqual(["/a"]);
	});

	it("allows nothing by default when started in / or the home folder", async () => {
		const dir = project("broad");
		for (const cwd of ["/", homedir()]) {
			vi.spyOn(process, "cwd").mockReturnValue(cwd);
			const { client, check } = await connect({});
			expect(await check(dir)).toMatch(/No folders are allowed[\s\S]*--root/);
			await client.close();
			vi.restoreAllMocks();
		}
	});

	it("uses the folder it was started in when that is specific", async () => {
		const dir = project("cwd");
		vi.spyOn(process, "cwd").mockReturnValue(dir);
		const { client, check } = await connect({});
		expect(await check(dir)).toMatch(/no deck "nope"/);
		await client.close();
	});

	it("uses named folders; client roots only narrow them", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const named = project("named");
		const fromClient = project("client");
		const a = await connect({ allowedRoots: [named] });
		expect(await a.check(named)).toMatch(/no deck "nope"/);
		expect(await a.check(fromClient)).toMatch(/outside the folders/);
		await a.client.close();
		// A client root outside the named folders is ignored…
		const b = await connect({ allowedRoots: [named] }, [fromClient]);
		expect(await b.check(fromClient)).toMatch(/outside the folders/);
		expect(await b.check(named)).toMatch(/no deck "nope"/);
		await b.client.close();
		// …one inside narrows them.
		const inner = join(named, "talks");
		mkdirSync(join(inner, "src", "content", "decks"), { recursive: true });
		const c = await connect({ allowedRoots: [named] }, [inner]);
		expect(await c.check(inner)).toMatch(/no deck "nope"/);
		expect(await c.check(named)).toMatch(/outside the folders/);
		await c.client.close();
		// Without named folders, client roots are used.
		const d = await connect({}, [fromClient]);
		expect(await d.check(fromClient)).toMatch(/no deck "nope"/);
		await d.client.close();
	});

	it("ignores broad or unreadable client roots, one by one", async () => {
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		const ok = project("one-ok");
		const elsewhere = project("one-elsewhere");
		const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
		vi.spyOn(process, "cwd").mockReturnValue("/");
		await createServer({}).connect(serverSide);
		const client = new Client({ name: "test", version: "0" }, { capabilities: { roots: {} } });
		client.setRequestHandler(ListRootsRequestSchema, () => ({
			roots: [
				{ uri: pathToFileURL(homedir()).href },
				{ uri: "file://other-host/share/x" },
				{ uri: pathToFileURL(ok).href },
			],
		}));
		await client.connect(clientSide);
		const check = async (projectRoot: string) =>
			(
				(await client.callTool({ name: "check_deck", arguments: { projectRoot, deck: "nope" } }))
					.content as { text: string }[]
			)[0]?.text ?? "";
		expect(await check(ok)).toMatch(/no deck "nope"/);
		expect(await check(elsewhere)).toMatch(/outside the folders/);
		expect(errors.mock.calls.flat().join("\n")).toMatch(/too broad/);
		await client.close();
	});

	it("works where it checked, not where a symlink points later", () => {
		const real = project("real");
		const link = `${real}-link`;
		symlinkSync(real, link);
		expect(projectRootWithin(link, [real])).toBe(real);
	});

	it("never takes the filesystem root as a root", async () => {
		const named = project("named-only");
		const elsewhere = project("elsewhere");
		vi.spyOn(console, "error").mockImplementation(() => {});
		// A client root of / is ignored: the named folder still applies.
		const a = await connect({ allowedRoots: [named] }, ["/"]);
		expect(await a.check(elsewhere)).toMatch(/outside the folders/);
		expect(await a.check(named)).toMatch(/no deck "nope"/);
		await a.client.close();
		const b = await connect({ allowedRoots: ["/"] });
		expect(await b.check(elsewhere)).toMatch(/No folders are allowed/);
		await b.client.close();
	});
});

describe("files and projects the tools may touch", () => {
	afterEach(() => vi.restoreAllMocks());

	async function connect(allowed: string) {
		const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
		await createServer({ allowedRoots: [allowed] }).connect(serverSide);
		const client = new Client({ name: "test", version: "0" });
		await client.connect(clientSide);
		const call = async (name: string, args: Record<string, unknown>) => {
			const r = await client.callTool({ name, arguments: args });
			return { error: !!r.isError, text: (r.content as { text: string }[])[0]?.text ?? "" };
		};
		return { client, call };
	}

	it("reads PowerPoint files only inside the allowed folders", async () => {
		const allowed = realpathSync(mkdtempSync(join(tmpdir(), "astlide-mcp-files-")));
		const outside = realpathSync(mkdtempSync(join(tmpdir(), "astlide-mcp-elsewhere-")));
		const potx = await template();
		writeFileSync(join(allowed, "in.potx"), potx);
		writeFileSync(join(outside, "out.potx"), potx);
		writeFileSync(join(outside, "notes.txt"), "secret");
		// A link inside that points outside, and one with the right name but other content.
		symlinkSync(join(outside, "out.potx"), join(allowed, "link.potx"));
		symlinkSync(join(outside, "notes.txt"), join(allowed, "notes.pptx"));
		mkdirSync(join(allowed, "folder.potx"));
		const { client, call } = await connect(allowed);
		expect((await call("template_layouts", { templatePath: join(allowed, "in.potx") })).error).toBe(
			false,
		);
		for (const templatePath of [join(outside, "out.potx"), join(allowed, "link.potx")])
			expect((await call("template_layouts", { templatePath })).text).toMatch(
				/outside the folders/,
			);
		expect(
			(await call("template_layouts", { templatePath: join(allowed, "folder.potx") })).text,
		).toMatch(/not a file/);
		expect((await call("import_pptx", { path: join(allowed, "notes.pptx") })).text).toMatch(
			/expected a \.pptx/,
		);
		expect((await call("import_pptx", { path: join(outside, "out.potx") })).error).toBe(true);
		await client.close();
	});

	it("builds only projects that are an allowed folder or directly in one", async () => {
		const allowed = realpathSync(mkdtempSync(join(tmpdir(), "astlide-mcp-depth-")));
		const child = join(allowed, "talk");
		const deeper = join(allowed, "clones", "someone-else");
		for (const dir of [child, deeper])
			mkdirSync(join(dir, "src", "content", "decks"), { recursive: true });
		expect(projectRootWithin(child, [allowed])).toBe(child);
		expect(() => projectRootWithin(deeper, [allowed])).toThrow(/more than one folder below/);
		// Named itself, it is allowed.
		expect(projectRootWithin(deeper, [deeper])).toBe(deeper);
	});

	it("runs a project's own CLI only when it is recent enough", () => {
		const project = (version: string) => {
			const root = mkdtempSync(join(tmpdir(), "astlide-mcp-cli-"));
			const core = join(root, "node_modules", "@astlide", "core");
			mkdirSync(join(core, "src", "cli"), { recursive: true });
			writeFileSync(
				join(core, "package.json"),
				JSON.stringify({
					name: "@astlide/core",
					version,
					type: "module",
					exports: { ".": "./src/index.ts" },
				}),
			);
			writeFileSync(join(core, "src", "index.ts"), "export {};\n");
			writeFileSync(join(root, "package.json"), "{}");
			return { root, cli: join(realpathSync(core), "src", "cli", "astlide.ts") };
		};
		const bundled = astlideCli(mkdtempSync(join(tmpdir(), "astlide-mcp-nocore-")));
		const recent = project(MIN_PROJECT_CLI);
		expect(realpathSync(dirname(astlideCli(recent.root)))).toBe(dirname(recent.cli));
		const old = project("2.7.1");
		expect(astlideCli(old.root)).toBe(bundled);
	});
});
