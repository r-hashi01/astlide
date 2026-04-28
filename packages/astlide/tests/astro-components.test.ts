/**
 * Astro component unit tests using the Container API.
 * Each test renders a component to an HTML string and asserts on attributes / styles / structure.
 *
 * Components are loaded via dynamic import() in beforeAll to avoid a deadlock
 * between Astro's Vite plugin (which transforms .astro files) and
 * AstroContainer.create() when both run inside vitest's worker process.
 * Static `import Foo from "*.astro"` triggers the transform at module-load
 * time, before beforeAll runs — causing the deadlock regardless of pool type.
 */

import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { AstroComponentFactory } from "astro/runtime/server/index.js";
import { beforeAll, describe, expect, it } from "vitest";

let container: AstroContainer;
let CodeBlock: AstroComponentFactory;
let Columns: AstroComponentFactory;
let Fragment: AstroComponentFactory;
let ImageSide: AstroComponentFactory;
let Left: AstroComponentFactory;
let MathComponent: AstroComponentFactory;
let Notes: AstroComponentFactory;
let Right: AstroComponentFactory;
let Slide: AstroComponentFactory;
let Tweet: AstroComponentFactory;
let YouTube: AstroComponentFactory;

beforeAll(async () => {
	container = await AstroContainer.create();

	// Dynamic imports: resolved AFTER AstroContainer.create() so the Astro Vite
	// plugin transform doesn't race with container initialisation.
	[
		{ default: CodeBlock },
		{ default: Columns },
		{ default: Fragment },
		{ default: ImageSide },
		{ default: Left },
		{ default: MathComponent },
		{ default: Notes },
		{ default: Right },
		{ default: Slide },
		{ default: Tweet },
		{ default: YouTube },
	] = await Promise.all([
		import("../src/components/CodeBlock.astro"),
		import("../src/components/Columns.astro"),
		import("../src/components/Fragment.astro"),
		import("../src/components/ImageSide.astro"),
		import("../src/components/Left.astro"),
		import("../src/components/Math.astro"),
		import("../src/components/Notes.astro"),
		import("../src/components/Right.astro"),
		import("../src/components/Slide.astro"),
		import("../src/components/Tweet.astro"),
		import("../src/components/YouTube.astro"),
	]);
});

// ── Fragment ──────────────────────────────────────────────────────────────────

describe("Fragment", () => {
	it("renders a span with data-fragment", async () => {
		const html = await container.renderToString(Fragment, { props: {} });
		expect(html).toContain("data-fragment");
	});

	it("defaults effect to fade", async () => {
		const html = await container.renderToString(Fragment, { props: {} });
		expect(html).toContain('data-fragment-effect="fade"');
	});

	it("applies explicit effect prop", async () => {
		const html = await container.renderToString(Fragment, { props: { effect: "zoom" } });
		expect(html).toContain('data-fragment-effect="zoom"');
	});

	it("sets data-fragment-index when index is provided", async () => {
		const html = await container.renderToString(Fragment, { props: { index: 3 } });
		expect(html).toContain('data-fragment-index="3"');
	});

	it("renders data-fragment-index with no value when index is omitted", async () => {
		const html = await container.renderToString(Fragment, { props: {} });
		// Astro serialises empty-string attributes without `=""` (boolean-style)
		expect(html).toContain("data-fragment-index");
		expect(html).not.toMatch(/data-fragment-index="\d/);
	});

	it("includes fragment class", async () => {
		const html = await container.renderToString(Fragment, { props: {} });
		expect(html).toContain("fragment");
	});

	it("applies extra class prop", async () => {
		const html = await container.renderToString(Fragment, { props: { class: "my-class" } });
		expect(html).toContain("my-class");
	});

	it("does not set static aria-hidden (managed by DeckLayout JS)", async () => {
		// aria-hidden is initialised dynamically by DeckLayout so that content remains
		// accessible to screen readers when JavaScript is unavailable.
		const html = await container.renderToString(Fragment, { props: {} });
		expect(html).not.toContain("aria-hidden");
	});
});

// ── Slide ─────────────────────────────────────────────────────────────────────

describe("Slide", () => {
	it("renders with default layout class", async () => {
		const html = await container.renderToString(Slide, { props: {} });
		expect(html).toContain("slide-default");
	});

	it("applies specified layout class", async () => {
		const html = await container.renderToString(Slide, { props: { layout: "cover" } });
		expect(html).toContain("slide-cover");
	});

	it("includes base slide class", async () => {
		const html = await container.renderToString(Slide, { props: {} });
		expect(html).toMatch(/class="[^"]*\bslide\b/);
	});

	it("sets data-transition attribute", async () => {
		const html = await container.renderToString(Slide, { props: { transition: "zoom" } });
		expect(html).toContain('data-transition="zoom"');
	});

	it("defaults data-transition to fade", async () => {
		const html = await container.renderToString(Slide, { props: {} });
		expect(html).toContain('data-transition="fade"');
	});

	it("applies hex color as background-color", async () => {
		const html = await container.renderToString(Slide, { props: { background: "#1e293b" } });
		expect(html).toContain("background-color: #1e293b");
	});

	it("applies linear-gradient as background shorthand", async () => {
		const html = await container.renderToString(Slide, {
			props: { background: "linear-gradient(135deg, #667eea, #764ba2)" },
		});
		expect(html).toContain("background: linear-gradient(135deg, #667eea, #764ba2)");
	});

	it("applies radial-gradient as background shorthand", async () => {
		const html = await container.renderToString(Slide, {
			props: { background: "radial-gradient(circle, #fff, #000)" },
		});
		expect(html).toContain("background: radial-gradient(circle, #fff, #000)");
	});

	it("unwraps url() background into background-image", async () => {
		const html = await container.renderToString(Slide, { props: { background: "url(/bg.jpg)" } });
		expect(html).toContain("background-image: url(/bg.jpg)");
		expect(html).toContain("background-size: cover");
	});

	it("applies bare image path as background-image", async () => {
		const html = await container.renderToString(Slide, {
			props: { background: "/photos/slide.jpg" },
		});
		expect(html).toContain("background-image: url(/photos/slide.jpg)");
	});

	it("no background → no background CSS in inline style", async () => {
		const html = await container.renderToString(Slide, { props: {} });
		expect(html).not.toContain("background-color");
		expect(html).not.toContain("background-image");
	});

	it("includes aria-label with slide position when both numbers are given", async () => {
		const html = await container.renderToString(Slide, {
			props: { slideNumber: 3, totalSlides: 10 },
		});
		expect(html).toContain("Slide 3 of 10");
	});

	it("omits aria-label when slideNumber is absent", async () => {
		const html = await container.renderToString(Slide, { props: {} });
		expect(html).not.toContain("aria-label=");
	});
});

// ── Columns ───────────────────────────────────────────────────────────────────

describe("Columns", () => {
	it("has columns class", async () => {
		const html = await container.renderToString(Columns, { props: {} });
		expect(html).toContain("columns");
	});

	it("generates repeat() grid from columns prop", async () => {
		const html = await container.renderToString(Columns, { props: { columns: 3 } });
		expect(html).toContain("grid-template-columns: repeat(3, 1fr)");
	});

	it("uses widths prop verbatim", async () => {
		const html = await container.renderToString(Columns, { props: { widths: "1fr 2fr" } });
		expect(html).toContain("grid-template-columns: 1fr 2fr");
	});

	it("widths takes precedence over columns", async () => {
		const html = await container.renderToString(Columns, {
			props: { columns: 3, widths: "300px 1fr" },
		});
		expect(html).toContain("grid-template-columns: 300px 1fr");
		expect(html).not.toContain("repeat(3");
	});

	it("defaults gap to 2rem", async () => {
		const html = await container.renderToString(Columns, { props: {} });
		expect(html).toContain("gap: 2rem");
	});

	it("applies custom gap", async () => {
		const html = await container.renderToString(Columns, { props: { gap: "1.5rem" } });
		expect(html).toContain("gap: 1.5rem");
	});

	it("defaults align-items to start", async () => {
		const html = await container.renderToString(Columns, { props: {} });
		expect(html).toContain("align-items: start");
	});

	it("applies custom align", async () => {
		const html = await container.renderToString(Columns, { props: { align: "center" } });
		expect(html).toContain("align-items: center");
	});

	it("no columns or widths → no grid-template-columns in style", async () => {
		const html = await container.renderToString(Columns, { props: {} });
		expect(html).not.toContain("grid-template-columns");
	});
});

// ── YouTube ───────────────────────────────────────────────────────────────────

describe("YouTube", () => {
	const ID = "dQw4w9WgXcQ";
	const embedBase = "https://www.youtube-nocookie.com/embed/";

	it("uses bare video ID as-is", async () => {
		const html = await container.renderToString(YouTube, { props: { id: ID } });
		expect(html).toContain(`src="${embedBase}${ID}"`);
	});

	it("extracts ID from youtube.com/watch URL", async () => {
		const html = await container.renderToString(YouTube, {
			props: { id: `https://www.youtube.com/watch?v=${ID}` },
		});
		expect(html).toContain(`src="${embedBase}${ID}"`);
	});

	it("extracts ID from youtu.be shortlink", async () => {
		const html = await container.renderToString(YouTube, {
			props: { id: `https://youtu.be/${ID}` },
		});
		expect(html).toContain(`src="${embedBase}${ID}"`);
	});

	it("extracts ID from youtube.com/embed URL", async () => {
		const html = await container.renderToString(YouTube, {
			props: { id: `https://www.youtube.com/embed/${ID}` },
		});
		expect(html).toContain(`src="${embedBase}${ID}"`);
	});

	it("appends start query param", async () => {
		const html = await container.renderToString(YouTube, { props: { id: ID, start: 42 } });
		expect(html).toContain(`embed/${ID}?start=42`);
	});

	it("no start → no query string", async () => {
		const html = await container.renderToString(YouTube, { props: { id: ID } });
		expect(html).not.toContain("?start");
	});

	it("defaults title to YouTube video", async () => {
		const html = await container.renderToString(YouTube, { props: { id: ID } });
		expect(html).toContain('title="YouTube video"');
	});

	it("uses custom title", async () => {
		const html = await container.renderToString(YouTube, { props: { id: ID, title: "My Video" } });
		expect(html).toContain('title="My Video"');
	});

	it("renders with youtube-embed class", async () => {
		const html = await container.renderToString(YouTube, { props: { id: ID } });
		expect(html).toContain("youtube-embed");
	});

	it("uses youtube-nocookie domain for privacy", async () => {
		const html = await container.renderToString(YouTube, { props: { id: ID } });
		expect(html).toContain("youtube-nocookie.com");
		expect(html).not.toContain("youtube.com/embed");
	});
});

// ── Tweet ─────────────────────────────────────────────────────────────────────

describe("Tweet", () => {
	const base = {
		url: "https://twitter.com/test/status/1",
		text: "Hello world",
		author: "Test User",
		handle: "testuser",
	};

	it("adds @ prefix when handle has none", async () => {
		const html = await container.renderToString(Tweet, { props: base });
		expect(html).toContain("@testuser");
	});

	it("does not double-prefix handle that already has @", async () => {
		const html = await container.renderToString(Tweet, { props: { ...base, handle: "@testuser" } });
		expect(html).toContain("@testuser");
		expect(html).not.toContain("@@testuser");
	});

	it("renders aria-label with author and text", async () => {
		const html = await container.renderToString(Tweet, { props: base });
		expect(html).toContain("Tweet by Test User: Hello world");
	});

	it("links to tweet URL and opens in new tab", async () => {
		const html = await container.renderToString(Tweet, { props: base });
		expect(html).toContain(`href="${base.url}"`);
		expect(html).toContain('target="_blank"');
	});

	it("renders date in a <time> element when provided", async () => {
		const html = await container.renderToString(Tweet, { props: { ...base, date: "Jan 1, 2025" } });
		expect(html).toContain("Jan 1, 2025");
		expect(html).toContain("<time");
	});

	it("omits <time> when date is not provided", async () => {
		const html = await container.renderToString(Tweet, { props: base });
		expect(html).not.toContain("<time");
	});

	it("renders avatar img when avatar URL is provided", async () => {
		const html = await container.renderToString(Tweet, {
			props: { ...base, avatar: "/avatar.jpg" },
		});
		expect(html).toContain("<img");
		expect(html).toContain("/avatar.jpg");
	});

	it("renders avatar placeholder div when no avatar", async () => {
		const html = await container.renderToString(Tweet, { props: base });
		expect(html).toContain("tweet-avatar-placeholder");
		expect(html).not.toContain("<img");
	});
});

// ── Notes ─────────────────────────────────────────────────────────────────────

describe("Notes", () => {
	it("has data-slide-notes attribute", async () => {
		const html = await container.renderToString(Notes, { props: {} });
		expect(html).toContain("data-slide-notes");
	});

	it("sets aria-hidden", async () => {
		const html = await container.renderToString(Notes, { props: {} });
		expect(html).toContain('aria-hidden="true"');
	});

	it("has slide-notes class", async () => {
		const html = await container.renderToString(Notes, { props: {} });
		expect(html).toContain("slide-notes");
	});
});

// ── CodeBlock ─────────────────────────────────────────────────────────────────

describe("CodeBlock", () => {
	it("renders copy button", async () => {
		const html = await container.renderToString(CodeBlock, { props: {} });
		expect(html).toContain("code-block-copy");
		expect(html).toContain("Copy code to clipboard");
	});

	it("renders title when provided", async () => {
		const html = await container.renderToString(CodeBlock, { props: { title: "src/index.ts" } });
		expect(html).toContain("src/index.ts");
		expect(html).toContain("code-block-title");
	});

	it("omits title span when title is not provided", async () => {
		const html = await container.renderToString(CodeBlock, { props: {} });
		expect(html).not.toContain("code-block-title");
	});

	it("generates unique id on each render", async () => {
		const html1 = await container.renderToString(CodeBlock, { props: {} });
		const html2 = await container.renderToString(CodeBlock, { props: {} });
		const id1 = html1.match(/id="(cb-[a-z0-9]+)"/)?.[1];
		const id2 = html2.match(/id="(cb-[a-z0-9]+)"/)?.[1];
		expect(id1).toBeTruthy();
		expect(id2).toBeTruthy();
		expect(id1).not.toBe(id2);
	});
});

// ── Left / Right ──────────────────────────────────────────────────────────────

describe("Left", () => {
	it("has column-left class", async () => {
		const html = await container.renderToString(Left, { props: {} });
		expect(html).toContain("column-left");
	});

	it("applies extra class prop", async () => {
		const html = await container.renderToString(Left, { props: { class: "my-left" } });
		expect(html).toContain("my-left");
	});
});

describe("Right", () => {
	it("has column-right class", async () => {
		const html = await container.renderToString(Right, { props: {} });
		expect(html).toContain("column-right");
	});

	it("applies extra class prop", async () => {
		const html = await container.renderToString(Right, { props: { class: "my-right" } });
		expect(html).toContain("my-right");
	});
});

// ── ImageSide ─────────────────────────────────────────────────────────────────

describe("ImageSide", () => {
	it("renders img with provided src", async () => {
		const html = await container.renderToString(ImageSide, { props: { src: "/photo.jpg" } });
		expect(html).toContain("/photo.jpg");
		expect(html).toContain("<img");
	});

	it("defaults alt to empty string (serialised as bare `alt`)", async () => {
		const html = await container.renderToString(ImageSide, { props: { src: "/x.jpg" } });
		// Astro serialises alt="" as bare `alt` attribute — no value
		expect(html).toMatch(/\balt\b/);
		expect(html).not.toContain('alt="');
	});

	it("defaults width to 50%", async () => {
		const html = await container.renderToString(ImageSide, { props: { src: "/x.jpg" } });
		expect(html).toContain("width: 50%");
	});

	it("applies custom width", async () => {
		const html = await container.renderToString(ImageSide, {
			props: { src: "/x.jpg", width: "40%" },
		});
		expect(html).toContain("width: 40%");
	});

	it("has image-side class", async () => {
		const html = await container.renderToString(ImageSide, { props: { src: "/x.jpg" } });
		expect(html).toContain("image-side");
	});
});

// ── Math ──────────────────────────────────────────────────────────────────────

describe("Math", () => {
	it("renders KaTeX HTML for a formula", async () => {
		const html = await container.renderToString(MathComponent, { props: { formula: "E=mc^2" } });
		expect(html).toContain("katex");
	});

	it("inline math does not have math-display class", async () => {
		const html = await container.renderToString(MathComponent, { props: { formula: "x^2" } });
		expect(html).not.toContain("math-display");
	});

	it("display math has math-display class", async () => {
		const html = await container.renderToString(MathComponent, {
			props: { formula: "x^2", display: true },
		});
		expect(html).toContain("math-display");
	});

	it("strips script tags (sanitization)", async () => {
		const html = await container.renderToString(MathComponent, { props: { formula: "x^2" } });
		expect(html).not.toContain("<script");
	});

	it("renders fraction formula without throwing", async () => {
		const html = await container.renderToString(MathComponent, {
			props: { formula: "\\frac{a}{b}" },
		});
		expect(html).toContain("katex");
	});

	it("handles invalid formula without throwing (throwOnError: false)", async () => {
		await expect(
			container.renderToString(MathComponent, { props: { formula: "\\invalidcmd" } }),
		).resolves.not.toThrow();
	});
});
