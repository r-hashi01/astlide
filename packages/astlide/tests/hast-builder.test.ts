import type { Element as HastElement, Root as HastRoot, RootContent, Text } from "hast";
import { describe, expect, it } from "vitest";
import { buildSlide } from "../src/cli/pptx/hast-builder";
import type { ParsedSlide } from "../src/cli/pptx/mdx-parser";
import type { RectSpec, SlideSpec, TextBoxSpec } from "../src/cli/pptx/ooxml-writer";
import { THEMES } from "../src/cli/pptx/theme-map";

// ── HAST tree builder helpers ──

function text(value: string): Text {
	return { type: "text", value };
}

function el(tagName: string, props: Record<string, unknown>, children: RootContent[]): HastElement {
	return { type: "element", tagName, properties: props, children };
}

function root(...children: RootContent[]): HastRoot {
	return { type: "root", children };
}

function slide(frontmatter: Record<string, unknown>, hast: HastRoot): ParsedSlide {
	return { frontmatter, hast, filePath: "/test.mdx" };
}

function textboxes(spec: SlideSpec): TextBoxSpec[] {
	return spec.elements.filter((e): e is TextBoxSpec => e.type === "textbox");
}

function rects(spec: SlideSpec): RectSpec[] {
	return spec.elements.filter((e): e is RectSpec => e.type === "rect");
}

function allRunTexts(spec: SlideSpec): string[] {
	return textboxes(spec).flatMap((tb) => tb.runs.map((r) => r.text));
}

// ── Layout dispatch ──

describe("buildSlide layout dispatch", () => {
	const h1 = el("h1", {}, [text("Title")]);
	const p = el("p", {}, [text("Content text")]);

	it("default: produces title and content textboxes", () => {
		const spec = buildSlide(slide({}, root(h1, p)), {});
		const tbs = textboxes(spec);
		expect(tbs.length).toBeGreaterThanOrEqual(2);
		expect(allRunTexts(spec)).toContain("Title");
		expect(allRunTexts(spec)).toContain("Content text");
	});

	it("cover: centers title vertically with large font", () => {
		const spec = buildSlide(slide({ slideLayout: "cover" }, root(h1, p)), {});
		const tbs = textboxes(spec);
		expect(tbs.length).toBeGreaterThanOrEqual(1);
		const titleTb = tbs.find((tb) => tb.runs.some((r) => r.text === "Title"));
		expect(titleTb).toBeDefined();
		expect(titleTb!.align).toBe("center");
		expect(titleTb!.valign).toBe("middle");
		// Cover title must use coverTitle fontSize (56pt), not default h1 (44pt)
		const titleRun = titleTb!.runs.find((r) => r.text === "Title");
		expect(titleRun!.options?.fontSize).toBe(56);
	});

	it("section: centers title in full slide with larger font and primary color", () => {
		const spec = buildSlide(slide({ slideLayout: "section" }, root(h1)), {});
		const tbs = textboxes(spec);
		expect(tbs.length).toBeGreaterThanOrEqual(1);
		const titleTb = tbs[0];
		expect(titleTb.align).toBe("center");
		expect(titleTb.valign).toBe("middle");
		expect(titleTb.h).toBe(5.625); // full slide height
		// Section title must use h1+8 fontSize (52pt) and primary color
		expect(titleTb.runs[0].options?.fontSize).toBe(52);
		expect(titleTb.runs[0].options?.color).toBe(THEMES.default.primary);
	});

	it("two-column: renders two column textboxes", () => {
		const left = el("div", { dataComponent: "Left" }, [el("p", {}, [text("Left col")])]);
		const right = el("div", { dataComponent: "Right" }, [el("p", {}, [text("Right col")])]);
		const spec = buildSlide(slide({ slideLayout: "two-column" }, root(h1, left, right)), {});
		const tbs = textboxes(spec);
		// At least title + 2 columns
		expect(tbs.length).toBeGreaterThanOrEqual(3);
		expect(allRunTexts(spec)).toContain("Left col");
		expect(allRunTexts(spec)).toContain("Right col");
	});

	it("image-full: creates overlay rect and centered white title", () => {
		const spec = buildSlide(
			slide({ slideLayout: "image-full", background: "/img.jpg" }, root(h1)),
			{},
		);
		const titleTb = textboxes(spec).find((tb) => tb.runs.some((r) => r.text === "Title"));
		expect(titleTb).toBeDefined();
		expect(titleTb!.align).toBe("center");
		expect(titleTb!.valign).toBe("middle");
		expect(titleTb!.h).toBe(5.625); // full slide height
		// Title on image-full must be white for readability over background image
		const titleRun = titleTb!.runs.find((r) => r.text === "Title");
		expect(titleRun!.options?.color).toBe("FFFFFF");
	});

	it("image-full with URL background: adds dark semi-transparent overlay rect", () => {
		const spec = buildSlide(
			slide({ slideLayout: "image-full", background: "/img.jpg" }, root(h1)),
			{},
		);
		const rs = rects(spec);
		expect(rs.length).toBeGreaterThanOrEqual(1);
		// Dark overlay to ensure readability
		expect(rs[0].fill).toBe("000000");
		expect(rs[0].fillTransparency).toBe(50);
		// Overlay covers the full slide
		expect(rs[0].x).toBe(0);
		expect(rs[0].y).toBe(0);
	});

	it("image-left: image placeholder on left, text on right", () => {
		const spec = buildSlide(slide({ slideLayout: "image-left" }, root(h1, p)), {});
		const rs = rects(spec);
		expect(rs.length).toBeGreaterThanOrEqual(1);
		// Image placeholder rect starts at x=0
		expect(rs[0].x).toBe(0);
	});

	it("image-right: image placeholder on right, text on left", () => {
		const spec = buildSlide(slide({ slideLayout: "image-right" }, root(h1, p)), {});
		const rs = rects(spec);
		expect(rs.length).toBeGreaterThanOrEqual(1);
		// Image placeholder rect at x = W/2 = 5
		expect(rs[0].x).toBe(5);
	});

	it("cover: subtitle uses coverSub font size", () => {
		const spec = buildSlide(slide({ slideLayout: "cover" }, root(h1, p)), {});
		const tbs = textboxes(spec);
		// Find subtitle textbox (not the title one)
		const subtitleTb = tbs.find((tb) => tb.runs.some((r) => r.text === "Content text"));
		expect(subtitleTb).toBeDefined();
		// Cover subtitle must use coverSub fontSize (24pt), not body (20pt)
		const subtitleRun = subtitleTb!.runs.find((r) => r.text === "Content text");
		expect(subtitleRun!.options?.fontSize).toBe(24);
	});

	it("code: dark background for light themes", () => {
		const spec = buildSlide(slide({ slideLayout: "code" }, root(h1, p)), {});
		// Default theme bg is FFFFFF → dark bg
		expect(spec.background).toBe("1E1E1E");
	});

	it("code: content uses monospace font and code colors", () => {
		const spec = buildSlide(slide({ slideLayout: "code" }, root(h1, p)), {});
		const tbs = textboxes(spec);
		const contentTb = tbs.find((tb) => tb.runs.some((r) => r.text === "Content text"));
		expect(contentTb).toBeDefined();
		const contentRun = contentTb!.runs.find((r) => r.text === "Content text");
		expect(contentRun!.options?.fontFace).toBe("Courier New");
		expect(contentRun!.options?.fontSize).toBe(16);
		expect(contentRun!.options?.color).toBe(THEMES.default.codeFg);
	});

	it("quote: applies italic, center alignment, and quote font size", () => {
		const spec = buildSlide(slide({ slideLayout: "quote" }, root(p)), {});
		const tbs = textboxes(spec);
		expect(tbs.length).toBeGreaterThanOrEqual(1);
		expect(tbs[0].align).toBe("center");
		expect(tbs[0].valign).toBe("middle");
		expect(tbs[0].runs[0].options?.italic).toBe(true);
		// Quote layout must use quote fontSize (36pt), not body (20pt)
		expect(tbs[0].runs[0].options?.fontSize).toBe(36);
	});

	it("statement: bold centered text with statement font size", () => {
		const spec = buildSlide(slide({ slideLayout: "statement" }, root(h1)), {});
		const tbs = textboxes(spec);
		expect(tbs.length).toBeGreaterThanOrEqual(1);
		expect(tbs[0].align).toBe("center");
		expect(tbs[0].valign).toBe("middle");
		expect(tbs[0].runs[0].options?.bold).toBe(true);
		// Statement layout must use statement fontSize (52pt), not h1 (44pt)
		expect(tbs[0].runs[0].options?.fontSize).toBe(52);
	});
});

// ── Background resolution ──

describe("buildSlide background", () => {
	const h1 = el("h1", {}, [text("Title")]);

	it("uses theme bg when no background in frontmatter", () => {
		const spec = buildSlide(slide({}, root(h1)), {});
		expect(spec.background).toBe(THEMES.default.bg);
	});

	it("resolves hex color background", () => {
		const spec = buildSlide(slide({ background: "#1e293b" }, root(h1)), {});
		expect(spec.background).toBe("1E293B");
	});

	it("resolves rgb() background", () => {
		const spec = buildSlide(slide({ background: "rgb(255,0,0)" }, root(h1)), {});
		expect(spec.background).toBe("FF0000");
	});

	it("falls back to theme bg for gradient", () => {
		const spec = buildSlide(
			slide({ background: "linear-gradient(to right, #1e293b, #0f172a)" }, root(h1)),
			{},
		);
		expect(spec.background).toBe(THEMES.default.bg);
	});

	it("sets backgroundPath for URL background", () => {
		const spec = buildSlide(slide({ background: "/images/bg.jpg" }, root(h1)), {});
		expect(spec.backgroundPath).toBe("/images/bg.jpg");
	});
});

// ── Theme resolution ──

describe("buildSlide theme", () => {
	const h1 = el("h1", {}, [text("Title")]);

	it("uses default theme when deckConfig has no theme", () => {
		const spec = buildSlide(slide({}, root(h1)), {});
		expect(spec.background).toBe(THEMES.default.bg);
	});

	it("uses dark theme from deckConfig", () => {
		const spec = buildSlide(slide({}, root(h1)), { theme: "dark" });
		expect(spec.background).toBe(THEMES.dark.bg);
	});
});

// ── Content extraction ──

describe("buildSlide content extraction", () => {
	it("first h1 becomes titleRuns", () => {
		const spec = buildSlide(
			slide({}, root(el("h1", {}, [text("My Title")]), el("p", {}, [text("Body")]))),
			{},
		);
		expect(allRunTexts(spec)).toContain("My Title");
	});

	it("subsequent elements become mainRuns", () => {
		const spec = buildSlide(
			slide({}, root(el("h1", {}, [text("Title")]), el("p", {}, [text("Paragraph")]))),
			{},
		);
		expect(allRunTexts(spec)).toContain("Paragraph");
	});

	it("Left component content goes to left column in two-column", () => {
		const left = el("div", { dataComponent: "Left" }, [el("p", {}, [text("L")])]);
		const right = el("div", { dataComponent: "Right" }, [el("p", {}, [text("R")])]);
		const spec = buildSlide(
			slide({ slideLayout: "two-column" }, root(el("h1", {}, [text("T")]), left, right)),
			{},
		);
		expect(allRunTexts(spec)).toContain("L");
		expect(allRunTexts(spec)).toContain("R");
	});

	it("Notes component is excluded from output", () => {
		const notes = el("div", { dataComponent: "Notes" }, [el("p", {}, [text("Speaker notes")])]);
		const spec = buildSlide(slide({}, root(el("h1", {}, [text("Title")]), notes)), {});
		expect(allRunTexts(spec)).not.toContain("Speaker notes");
	});
});

// ── Inline formatting ──

describe("buildSlide inline formatting", () => {
	function buildDefaultWithBody(...bodyChildren: RootContent[]): SlideSpec {
		return buildSlide(slide({}, root(el("h1", {}, [text("T")]), el("p", {}, bodyChildren))), {});
	}

	it("<strong> produces bold TextRun", () => {
		const spec = buildDefaultWithBody(el("strong", {}, [text("bold")]));
		const runs = textboxes(spec).flatMap((tb) => tb.runs);
		const boldRun = runs.find((r) => r.text === "bold");
		expect(boldRun).toBeDefined();
		expect(boldRun!.options?.bold).toBe(true);
	});

	it("<em> produces italic TextRun", () => {
		const spec = buildDefaultWithBody(el("em", {}, [text("italic")]));
		const runs = textboxes(spec).flatMap((tb) => tb.runs);
		const italicRun = runs.find((r) => r.text === "italic");
		expect(italicRun).toBeDefined();
		expect(italicRun!.options?.italic).toBe(true);
	});

	it("nested <strong><em> produces bold + italic", () => {
		const spec = buildDefaultWithBody(el("strong", {}, [el("em", {}, [text("both")])]));
		const runs = textboxes(spec).flatMap((tb) => tb.runs);
		const run = runs.find((r) => r.text === "both");
		expect(run).toBeDefined();
		expect(run!.options?.bold).toBe(true);
		expect(run!.options?.italic).toBe(true);
	});

	it("<code> produces monospace font TextRun", () => {
		const spec = buildDefaultWithBody(el("code", {}, [text("code")]));
		const runs = textboxes(spec).flatMap((tb) => tb.runs);
		const codeRun = runs.find((r) => r.text === "code");
		expect(codeRun).toBeDefined();
		expect(codeRun!.options?.fontFace).toBe("Courier New");
	});

	it("<a href> produces hyperlink TextRun", () => {
		const spec = buildDefaultWithBody(el("a", { href: "https://example.com" }, [text("link")]));
		const runs = textboxes(spec).flatMap((tb) => tb.runs);
		const linkRun = runs.find((r) => r.text === "link");
		expect(linkRun).toBeDefined();
		expect(linkRun!.options?.hyperlink).toEqual({ url: "https://example.com" });
	});

	it("<del> produces secondary color TextRun", () => {
		const spec = buildDefaultWithBody(el("del", {}, [text("deleted")]));
		const runs = textboxes(spec).flatMap((tb) => tb.runs);
		const delRun = runs.find((r) => r.text === "deleted");
		expect(delRun).toBeDefined();
		expect(delRun!.options?.color).toBe(THEMES.default.secondary);
	});
});

// ── Block rendering ──

describe("buildSlide block rendering", () => {
	it("unordered list produces bullet TextRuns", () => {
		const ul = el("ul", {}, [
			el("li", {}, [el("p", {}, [text("item 1")])]),
			el("li", {}, [el("p", {}, [text("item 2")])]),
		]);
		const spec = buildSlide(slide({}, root(el("h1", {}, [text("T")]), ul)), {});
		const runs = textboxes(spec).flatMap((tb) => tb.runs);
		const bulletRuns = runs.filter((r) => r.options?.bullet);
		expect(bulletRuns.length).toBeGreaterThanOrEqual(2);
	});

	it("ordered list produces numbered bullet TextRuns", () => {
		const ol = el("ol", {}, [
			el("li", {}, [el("p", {}, [text("first")])]),
			el("li", {}, [el("p", {}, [text("second")])]),
		]);
		const spec = buildSlide(slide({}, root(el("h1", {}, [text("T")]), ol)), {});
		const runs = textboxes(spec).flatMap((tb) => tb.runs);
		const numberedRuns = runs.filter(
			(r) =>
				r.options?.bullet &&
				typeof r.options.bullet === "object" &&
				"type" in r.options.bullet &&
				r.options.bullet.type === "number",
		);
		expect(numberedRuns.length).toBeGreaterThanOrEqual(2);
	});

	it("pre/code produces monospace runs", () => {
		const pre = el("pre", {}, [el("code", {}, [text("const x = 1;")])]);
		const spec = buildSlide(slide({}, root(el("h1", {}, [text("T")]), pre)), {});
		const runs = textboxes(spec).flatMap((tb) => tb.runs);
		const codeRun = runs.find((r) => r.text === "const x = 1;");
		expect(codeRun).toBeDefined();
		expect(codeRun!.options?.fontFace).toBe("Courier New");
	});

	it("blockquote applies secondary color and indent", () => {
		const bq = el("blockquote", {}, [el("p", {}, [text("quoted text")])]);
		const spec = buildSlide(slide({}, root(el("h1", {}, [text("T")]), bq)), {});
		const runs = textboxes(spec).flatMap((tb) => tb.runs);
		const quoteRun = runs.find((r) => r.text === "quoted text");
		expect(quoteRun).toBeDefined();
		expect(quoteRun!.options?.color).toBe(THEMES.default.secondary);
		expect(quoteRun!.options?.indentLevel).toBeGreaterThanOrEqual(1);
	});

	it("list item with mixed inline formatting: breakLine and bullet on last run", () => {
		// - **bold** and normal
		const ul = el("ul", {}, [
			el("li", {}, [el("p", {}, [el("strong", {}, [text("bold")]), text(" and normal")])]),
		]);
		const spec = buildSlide(slide({}, root(el("h1", {}, [text("T")]), ul)), {});
		const runs = textboxes(spec).flatMap((tb) => tb.runs);

		const boldRun = runs.find((r) => r.text === "bold");
		const normalRun = runs.find((r) => r.text === " and normal");
		expect(boldRun).toBeDefined();
		expect(normalRun).toBeDefined();
		expect(boldRun!.options?.bold).toBe(true);

		// The LAST run of the list item must carry breakLine + bullet
		// (consistent with renderParagraph and renderHeading)
		expect(normalRun!.options?.breakLine).toBe(true);
		expect(normalRun!.options?.bullet).toBeDefined();
		// The FIRST run must NOT have breakLine (it's mid-paragraph)
		expect(boldRun!.options?.breakLine).toBeUndefined();
	});

	it("nested list items have increased indentLevel", () => {
		// - outer item
		//   - nested item
		const ul = el("ul", {}, [
			el("li", {}, [
				el("p", {}, [text("outer")]),
				el("ul", {}, [el("li", {}, [el("p", {}, [text("nested")])])]),
			]),
		]);
		const spec = buildSlide(slide({}, root(el("h1", {}, [text("T")]), ul)), {});
		const runs = textboxes(spec).flatMap((tb) => tb.runs);

		const outerRun = runs.find((r) => r.text === "outer");
		const nestedRun = runs.find((r) => r.text === "nested");
		expect(outerRun).toBeDefined();
		expect(nestedRun).toBeDefined();
		// Outer item: indentLevel=0, nested: indentLevel=1
		expect(outerRun!.options?.indentLevel).toBe(0);
		expect(nestedRun!.options?.indentLevel).toBe(1);
		// Both must have bullet markers
		expect(outerRun!.options?.bullet).toBeDefined();
		expect(nestedRun!.options?.bullet).toBeDefined();
	});
});

// ── Component handling ──

describe("buildSlide components", () => {
	it("Math produces placeholder text", () => {
		const math = el("div", { dataComponent: "Math", dataFormula: "E=mc^2" }, []);
		const spec = buildSlide(slide({}, root(el("h1", {}, [text("T")]), math)), {});
		expect(allRunTexts(spec)).toContain("[Math: E=mc^2]");
	});

	it("YouTube produces placeholder text", () => {
		const yt = el("div", { dataComponent: "YouTube", dataId: "abc123" }, []);
		const spec = buildSlide(slide({}, root(el("h1", {}, [text("T")]), yt)), {});
		const texts = allRunTexts(spec);
		expect(texts.some((t) => t.includes("YouTube") && t.includes("abc123"))).toBe(true);
	});

	it("Fragment renders children transparently", () => {
		const frag = el("div", { dataComponent: "Fragment" }, [el("p", {}, [text("revealed")])]);
		const spec = buildSlide(slide({}, root(el("h1", {}, [text("T")]), frag)), {});
		expect(allRunTexts(spec)).toContain("revealed");
	});
});
