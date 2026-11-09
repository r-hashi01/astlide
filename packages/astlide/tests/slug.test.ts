import { describe, expect, it } from "vitest";
import { layoutSlug, slugify } from "../src/pptx/slug";

describe("slugify", () => {
	it("joins lowercase words with single hyphens, none at the ends", () => {
		expect(slugify("  Title & Content -- (2)  ")).toBe("title-content-2");
	});

	it("drops accents from Latin letters and keeps other scripts whole", () => {
		expect(slugify("Café Überblick")).toBe("cafe-uberblick");
		expect(slugify("Résumé — naïve Ñandú")).toBe("resume-naive-nandu");
		expect(slugify("ガイドの概要")).toBe("ガイドの概要");
	});

	it("cuts at 48 characters without a trailing hyphen", () => {
		const slug = slugify(`${"a".repeat(47)} b`);
		expect(slug).toBe("a".repeat(47));
	});

	it("falls back when nothing is left", () => {
		expect(slugify("---")).toBe("slide");
		expect(slugify("!!!", "layout")).toBe("layout");
	});

	it("keeps template layout names as decks already refer to them", () => {
		expect(layoutSlug("Café Überblick")).toBe("cafe-u-berblick");
		expect(layoutSlug("ガイド")).toBe("カ-イト");
		expect(layoutSlug("Title Slide")).toBe("title-slide");
		expect(layoutSlug("")).toBe("layout");
	});
});
