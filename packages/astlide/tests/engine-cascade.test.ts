import { selectOne } from "css-select";
import type { Element } from "domhandler";
import { parseDocument } from "htmlparser2";
import { describe, expect, it } from "vitest";
import { mediaMatches, StyleSheets } from "../src/engine/cascade";

/** The declared value of `prop` on `.t`, with `css` on a page of `width` px. */
function declared(css: string, html: string, prop: string, width = 1920): string | undefined {
	const sheets = new StyleSheets({ width, height: 1080, media: "screen" });
	sheets.add(css);
	const el = selectOne(".t", parseDocument(html).children) as Element;
	return sheets.declared(el).get(prop);
}

describe("cascade", () => {
	it("applies nested rules in their parent's context, not to the parent", () => {
		const html = '<div class="a t"><p class="b">x</p></div>';
		expect(declared(".a{color:red; &:hover{color:blue}}", html, "color")).toBe("red");
		expect(declared(".a{color:red; &.t{color:green}}", html, "color")).toBe("green");
		// `&` later in the selector: `.p .a`.
		const inP = ".a{color:red; .p &{color:blue}}";
		expect(declared(inP, '<div class="p"><i class="a t">x</i></div>', "color")).toBe("blue");
		expect(declared(inP, '<i class="a t">x</i>', "color")).toBe("red");
		const nested = ".a{color:red; @media (max-width:600px){color:blue}}";
		expect(declared(nested, html, "color")).toBe("red");
		expect(declared(nested, html, "color", 400)).toBe("blue");
		expect(
			declared(".a{.b{color:blue}}", '<div class="a"><p class="b t">x</p></div>', "color"),
		).toBe("blue");
	});

	it("ranks cascade layers: unlayered wins, later layers win, reversed for !important", () => {
		const h1 = '<h1 class="t">x</h1>';
		expect(declared("@layer utilities{.t{color:blue}} h1{color:red}", h1, "color")).toBe("red");
		expect(
			declared("@layer a,b; @layer b{h1{color:blue}} @layer a{.t{color:red}}", h1, "color"),
		).toBe("blue");
		expect(
			declared("@layer a{h1{color:blue!important}} .t{color:red!important}", h1, "color"),
		).toBe("blue");
	});

	it("counts [id=x] as an attribute, #x as an id", () => {
		const div = '<div id="x" class="t a b">x</div>';
		expect(declared("[id=x]{color:blue} .a.b{color:red}", div, "color")).toBe("red");
		expect(declared("#x{color:blue} .a.b{color:red}", div, "color")).toBe("blue");
	});

	it("reads inline styles with ; inside url() and ! important with a space", () => {
		const sheets = new StyleSheets({ width: 1920, height: 1080, media: "screen" });
		sheets.add(".t{color:red!important}");
		const el = selectOne(
			".t",
			parseDocument(
				'<div class="t" style="background-image:url(data:image/svg+xml;utf8,<svg/>);color:blue ! important"></div>',
			).children,
		) as Element;
		const d = sheets.declared(el);
		expect(d.get("background-image")).toBe("url(data:image/svg+xml;utf8,<svg/>)");
		expect(d.get("color")).toBe("blue");
	});

	it("reads keywords in any case", () => {
		expect(declared(".t{DISPLAY:FLEX}", '<div class="t"></div>', "display")).toBe("flex");
		expect(declared('.t{font-family:"Open Sans"}', '<div class="t"></div>', "font-family")).toBe(
			'"Open Sans"',
		);
	});
});

describe("media queries", () => {
	// Checked against Chromium's matchMedia at 1920×1080 (screen).
	const vp = { width: 1920, height: 1080, media: "screen" as const };
	it.each([
		"all",
		"screen",
		"not print",
		"only screen and (min-width: 768px)",
		"(width >= 768px)",
		"(400px <= width <= 2000px)",
		"(min-width: 48em)",
		"(orientation: landscape)",
		"(min-aspect-ratio: 16/9)",
		"(prefers-color-scheme: light)",
		"(hover: hover)",
		"not (orientation: portrait)",
		"(max-width: 600px), (min-width: 1500px)",
		"(max-width: 600px) or (min-width: 1500px)",
		"not all and (monochrome)",
		"(color)",
		"(min-device-width: 1024px)",
		"(width)",
		"(1000px < width)",
	])("%s matches", (q) => {
		expect(mediaMatches(q, vp)).toBe(true);
	});
	it.each([
		"print",
		"(width < 768px)",
		"(max-width: 48em)",
		"(orientation: portrait)",
		"(max-aspect-ratio: 4/3)",
		"(prefers-color-scheme: dark)",
		"(prefers-reduced-motion: reduce)",
		"(prefers-reduced-motion)",
		"(hover: none)",
		"(pointer: coarse)",
		"(min-resolution: 2dppx)",
		"(-webkit-min-device-pixel-ratio: 2)",
		"(display-mode: standalone)",
		"(min-width: 600px) and (max-width: 1000px)",
		"screen and (max-width: 767px)",
		"tv",
		"(height > 2000px)",
	])("%s doesn't match", (q) => {
		expect(mediaMatches(q, vp)).toBe(false);
	});
});

describe("@supports", () => {
	it("applies supported conditions and not their negation", () => {
		const div = '<div class="t"></div>';
		expect(declared("@supports (display:grid){.t{color:blue}}", div, "color")).toBe("blue");
		expect(
			declared(".t{color:red} @supports not (display:grid){.t{color:blue}}", div, "color"),
		).toBe("red");
		expect(declared("@supports selector(:has(a)){.t{color:blue}}", div, "color")).toBe("blue");
	});
});
