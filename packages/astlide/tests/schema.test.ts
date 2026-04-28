import { describe, expect, it } from "vitest";
import type { DeckConfig, SlideData } from "../src/schema";
import { deckConfigSchema, slideSchema, THEMES } from "../src/schema";

describe("slideSchema", () => {
	// ── Defaults ──

	it("returns defaults when given an empty object", () => {
		const result = slideSchema.parse({});
		expect(result).toEqual({
			slideLayout: "default",
			transition: "fade",
			hidden: false,
		});
	});

	// ── slideLayout ──

	describe("slideLayout", () => {
		const validLayouts = [
			"default",
			"cover",
			"section",
			"two-column",
			"image-full",
			"image-left",
			"image-right",
			"code",
			"quote",
			"statement",
		] as const;

		for (const layout of validLayouts) {
			it(`accepts "${layout}"`, () => {
				const result = slideSchema.parse({ slideLayout: layout });
				expect(result.slideLayout).toBe(layout);
			});
		}

		it("accepts arbitrary plugin-contributed layout names", () => {
			// Schema now uses z.string() to support plugin-contributed layouts.
			// Unknown names are validated at runtime (dev warning) but the schema does not reject them.
			const result = slideSchema.parse({ slideLayout: "custom-plugin-layout" });
			expect(result.slideLayout).toBe("custom-plugin-layout");
		});

		it("defaults to 'default' when omitted", () => {
			const result = slideSchema.parse({});
			expect(result.slideLayout).toBe("default");
		});
	});

	// ── transition ──

	describe("transition", () => {
		const validTransitions = [
			"none",
			"fade",
			"slide-left",
			"slide-right",
			"slide-up",
			"zoom",
		] as const;

		for (const t of validTransitions) {
			it(`accepts "${t}"`, () => {
				const result = slideSchema.parse({ transition: t });
				expect(result.transition).toBe(t);
			});
		}

		it("accepts arbitrary plugin-contributed transition names", () => {
			// Schema now uses z.string() to support plugin-contributed transitions.
			const result = slideSchema.parse({ transition: "flip" });
			expect(result.transition).toBe("flip");
		});

		it("defaults to 'fade' when omitted", () => {
			const result = slideSchema.parse({});
			expect(result.transition).toBe("fade");
		});
	});

	// ── Optional strings ──

	describe("optional string fields", () => {
		it("accepts title", () => {
			const result = slideSchema.parse({ title: "Hello" });
			expect(result.title).toBe("Hello");
		});

		it("title is undefined when omitted", () => {
			const result = slideSchema.parse({});
			expect(result.title).toBeUndefined();
		});

		it("accepts background as color", () => {
			const result = slideSchema.parse({ background: "#1e293b" });
			expect(result.background).toBe("#1e293b");
		});

		it("accepts background as gradient", () => {
			const result = slideSchema.parse({
				background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
			});
			expect(result.background).toBe("linear-gradient(135deg, #667eea 0%, #764ba2 100%)");
		});

		it("accepts background as url()", () => {
			const result = slideSchema.parse({ background: "url(/images/bg.jpg)" });
			expect(result.background).toBe("url(/images/bg.jpg)");
		});

		it("rejects background with expression()", () => {
			expect(() => slideSchema.parse({ background: "expression(alert(1))" })).toThrow();
		});

		it("rejects background with javascript: url", () => {
			expect(() => slideSchema.parse({ background: "url(javascript:alert(1))" })).toThrow();
		});

		it("rejects background with curly braces", () => {
			expect(() => slideSchema.parse({ background: "red } body { display: none" })).toThrow();
		});

		it("rejects background with data:image/svg+xml url", () => {
			expect(() =>
				slideSchema.parse({ background: "url('data:image/svg+xml,<svg onload=alert(1)>')" }),
			).toThrow();
		});

		it("rejects background with data:text/html url", () => {
			expect(() =>
				slideSchema.parse({ background: "url('data:text/html,<script>alert(1)</script>')" }),
			).toThrow();
		});

		it("rejects background with vbscript: url", () => {
			expect(() => slideSchema.parse({ background: "url(vbscript:msgbox(1))" })).toThrow();
		});

		it("accepts class", () => {
			const result = slideSchema.parse({ class: "text-light" });
			expect(result.class).toBe("text-light");
		});

		it("accepts notes", () => {
			const result = slideSchema.parse({ notes: "Speaker notes here" });
			expect(result.notes).toBe("Speaker notes here");
		});
	});

	// ── hidden ──

	describe("hidden", () => {
		it("defaults to false", () => {
			const result = slideSchema.parse({});
			expect(result.hidden).toBe(false);
		});

		it("accepts true", () => {
			const result = slideSchema.parse({ hidden: true });
			expect(result.hidden).toBe(true);
		});

		it("rejects non-boolean", () => {
			expect(() => slideSchema.parse({ hidden: "yes" })).toThrow();
		});
	});

	// ── Full valid object ──

	it("parses a full valid slide frontmatter", () => {
		const input = {
			slideLayout: "cover",
			transition: "zoom",
			title: "Welcome",
			background: "#000",
			class: "text-light",
			notes: "Opening slide",
			hidden: false,
		};
		const result = slideSchema.parse(input);
		expect(result).toEqual(input);
	});

	// ── Unknown fields are stripped ──

	it("strips unknown fields", () => {
		const result = slideSchema.parse({ unknownField: "should be stripped" });
		expect(result).not.toHaveProperty("unknownField");
	});

	// ── Type safety ──

	it("type SlideData matches parsed result", () => {
		const result: SlideData = slideSchema.parse({});
		expect(result.slideLayout).toBe("default");
		expect(result.transition).toBe("fade");
		expect(result.hidden).toBe(false);
	});
});

// ── deckConfigSchema ───────────────────────────────────────────────────────────

describe("deckConfigSchema", () => {
	// ── Defaults ──

	it("returns defaults when given an empty object", () => {
		const result = deckConfigSchema.parse({});
		expect(result).toEqual({ theme: "default" });
	});

	it("defaults theme to 'default'", () => {
		expect(deckConfigSchema.parse({}).theme).toBe("default");
	});

	// ── theme ──

	describe("theme", () => {
		for (const theme of THEMES) {
			it(`accepts "${theme}"`, () => {
				expect(deckConfigSchema.parse({ theme }).theme).toBe(theme);
			});
		}

		it("accepts arbitrary plugin-contributed theme names", () => {
			// deckConfigSchema.theme uses z.string() to support plugin-contributed themes.
			// Unknown names trigger a dev warning at render time, not a parse error.
			expect(deckConfigSchema.parse({ theme: "midnight" }).theme).toBe("midnight");
		});

		it("safeParse succeeds for any string theme name", () => {
			const result = deckConfigSchema.safeParse({ theme: "neon" });
			expect(result.success).toBe(true);
		});
	});

	// ── Optional string fields ──

	describe("optional string fields", () => {
		it("accepts title", () => {
			expect(deckConfigSchema.parse({ title: "My Talk" }).title).toBe("My Talk");
		});

		it("title is undefined when omitted", () => {
			expect(deckConfigSchema.parse({}).title).toBeUndefined();
		});

		it("accepts author", () => {
			expect(deckConfigSchema.parse({ author: "Alice" }).author).toBe("Alice");
		});

		it("author is undefined when omitted", () => {
			expect(deckConfigSchema.parse({}).author).toBeUndefined();
		});

		it("accepts date string", () => {
			expect(deckConfigSchema.parse({ date: "2025-06-01" }).date).toBe("2025-06-01");
		});

		it("date is undefined when omitted", () => {
			expect(deckConfigSchema.parse({}).date).toBeUndefined();
		});
	});

	// ── Unknown fields are stripped ──

	it("strips unknown fields", () => {
		const result = deckConfigSchema.parse({ customField: "should be stripped" });
		expect(result).not.toHaveProperty("customField");
	});

	// ── Full valid object ──

	it("parses a full valid _config.json", () => {
		const input = { title: "My Talk", author: "Alice", date: "2025-06-01", theme: "dark" };
		const result = deckConfigSchema.parse(input);
		expect(result).toEqual(input);
	});

	// ── Type safety ──

	it("type DeckConfig matches parsed result", () => {
		const result: DeckConfig = deckConfigSchema.parse({ title: "Test", theme: "minimal" });
		expect(result.theme).toBe("minimal");
		expect(result.title).toBe("Test");
	});

	// ── THEMES constant ──

	it("THEMES includes all 7 built-in theme names", () => {
		expect(THEMES).toHaveLength(7);
		expect(THEMES).toContain("default");
		expect(THEMES).toContain("dark");
		expect(THEMES).toContain("forest");
	});
});
