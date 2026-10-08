import { describe, expect, it } from "vitest";
import { slideTitle } from "../src/utils/slide-title";

describe("slideTitle", () => {
	it("prefers frontmatter title", () => {
		expect(slideTitle({ data: { title: " Agenda " }, body: "# Heading" })).toBe("Agenda");
	});

	it("uses the first Markdown heading", () => {
		expect(slideTitle({ data: {}, body: "Intro\n\n## Second level\n\n# Later" })).toBe(
			"Second level",
		);
	});

	it("strips inline Markdown markup", () => {
		expect(slideTitle({ data: {}, body: "# **Bold** `code` and [link](https://x.y)" })).toBe(
			"Bold code and link",
		);
	});

	it("ignores headings inside code fences", () => {
		const body = "```bash\n# install\nbun add x\n```\n\n# Real title";
		expect(slideTitle({ data: {}, body })).toBe("Real title");
	});

	it("reads HTML headings for .html slides", () => {
		expect(
			slideTitle({
				data: {},
				body: '<section><h2 class="t">Tom &amp; <em>Jerry</em></h2></section>',
			}),
		).toBe("Tom & Jerry");
	});

	it("takes whichever heading comes first", () => {
		expect(slideTitle({ data: {}, body: "<h1>HTML first</h1>\n\n# Markdown second" })).toBe(
			"HTML first",
		);
	});

	it("returns undefined without a heading", () => {
		expect(slideTitle({ data: {}, body: "Just text" })).toBeUndefined();
		expect(slideTitle({ data: {} })).toBeUndefined();
	});
});
