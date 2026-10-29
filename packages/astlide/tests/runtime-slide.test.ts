import { describe, expect, it } from "vitest";
import { backgroundStyle, renderSlideHtml, slideShell } from "../src/runtime/slide";

describe("slide shell", () => {
	it("renders the section with the layout's classes around the content", () => {
		expect(
			renderSlideHtml(
				{ layout: "cover", className: "dark", slideNumber: 1, totalSlides: 3 },
				"<h1>Hi</h1>",
			),
		).toBe(
			'<section class="slide slide-cover dark" data-transition="fade" role="region" aria-roledescription="slide" aria-label="Slide 1 of 3"><div class="slide-content"><h1>Hi</h1></div></section>',
		);
		expect(renderSlideHtml({}, "x")).toContain('class="slide slide-default"');
	});

	it("turns a background into CSS, resolving root-relative images", () => {
		expect(backgroundStyle("#0b132b")).toBe("background-color: #0b132b;");
		expect(backgroundStyle("linear-gradient(red, blue)")).toBe(
			"background: linear-gradient(red, blue);",
		);
		expect(backgroundStyle("/bg.png", (p) => `/base${p}`)).toBe(
			"background-image: url(/base/bg.png); background-size: cover; background-position: center;",
		);
		expect(backgroundStyle("url('https://x.test/a.jpg')")).toContain("url('https://x.test/a.jpg')");
		// Unsafe values are dropped by the sanitizer.
		expect(backgroundStyle("red; } body { display: none")).toBe("");
		expect(renderSlideHtml({ background: "#fff" }, "")).toContain(
			'style="background-color: #fff;"',
		);
	});

	it("draws a PowerPoint template's artwork for the layout, and its slide number", () => {
		const template = {
			layouts: {
				"title-slide": { art: "<i>title art</i>", slideNumber: false },
				"title-and-content": { art: "<i>content art</i>", slideNumber: true },
			},
			aliases: { cover: "title-slide", default: "title-and-content" },
			master: "<i>master</i>",
		};
		const content = renderSlideHtml({ template, slideNumber: 4, totalSlides: 9 }, "x");
		expect(content).toContain(
			'class="slide slide-default astlide-tpl astlide-tpl-title-and-content"',
		);
		expect(content).toContain('<div class="astlide-tpl-art"><i>content art</i></div>');
		expect(content).toContain('<div class="astlide-tpl-number">4</div>');
		expect(slideShell({ template, layout: "quote" }).templateArt).toBe("<i>master</i>");
		// A slide with its own background shows that instead of the artwork.
		expect(slideShell({ template, background: "#000" }).templateArt).toBeUndefined();
	});
});
