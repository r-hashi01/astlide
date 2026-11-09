import { describe, expect, it } from "vitest";
import { slugify } from "../src/pptx/slug";

describe("slugify", () => {
	it("joins lowercase words with single hyphens, none at the ends", () => {
		expect(slugify("  Title & Content -- (2)  ")).toBe("title-content-2");
	});

	it("cuts at 48 characters without a trailing hyphen", () => {
		const slug = slugify(`${"a".repeat(47)} b`);
		expect(slug).toBe("a".repeat(47));
	});

	it("falls back when nothing is left", () => {
		expect(slugify("---")).toBe("slide");
		expect(slugify("!!!", "layout")).toBe("layout");
	});
});
