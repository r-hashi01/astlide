import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cspHashable, DEFAULT_DECK_CSP } from "@astlide/core/utils/csp.ts";
import {
	hashBuiltPages,
	inlineScripts,
	markedCspMeta,
	withPageHashes,
	withScriptHashes,
} from "@astlide/core/utils/csp-hashes.ts";
import { slideContentComments, slideContentMarks } from "@astlide/core/utils/slide-mark.ts";
import island from "astro/runtime/server/astro-island.prebuilt.js";
import { describe, expect, it } from "vitest";

const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
const MARK = "0123abcd";
const { start, end } = slideContentMarks(MARK);

const page = (head: string, body: string) =>
	`<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
const meta = (policy: string, marked = true) =>
	`<meta http-equiv="Content-Security-Policy" content="${policy}"${marked ? " data-astlide-csp" : ""}>`;
const slide = (content: string) =>
	`<section class="slide"><!--${start}-->${content}<!--${end}--></section>`;

describe("inlineScripts", () => {
	it("hashes the exact text of inline scripts and skips external ones", () => {
		const a = "\n  console.log('a < b && </p>');\n";
		const html = page(
			'<script type="module" src="/x.js"></script>',
			`<script>${a}</script><SCRIPT type="module">b()</SCRIPT><svg><script>c()</script></svg>`,
		);
		expect(inlineScripts(html, MARK).map((s) => s.hash)).toEqual([sha(a), sha("b()"), sha("c()")]);
	});

	it("tells slide content apart, except Astro's island scripts", () => {
		const html = page(
			"<script>layout()</script>",
			`${slide(`<script>slideOwn()</script><script>${island}</script>`)}<script>after()</script>`,
		);
		expect(inlineScripts(html, MARK).map((s) => s.inSlide)).toEqual([false, true, false, false]);
	});

	it("can't be fooled by an end mark without the build's value", () => {
		const html = page(
			"",
			slide("<!--/astlide-slide:--><!--/astlide-slide:guess--><script>evil()</script>"),
		);
		expect(inlineScripts(html, MARK)).toEqual([{ hash: sha("evil()"), inSlide: true }]);
	});
});

describe("withScriptHashes", () => {
	it("replaces 'unsafe-inline' in script-src only", () => {
		expect(
			withScriptHashes(
				"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'",
				["'sha256-x'"],
			),
		).toBe("default-src 'self'; script-src 'self' 'sha256-x'; style-src 'unsafe-inline'");
	});
});

describe("withPageHashes", () => {
	it("rewrites the marked policy and drops the marker", () => {
		const out = withPageHashes(page(meta(DEFAULT_DECK_CSP), ""), [sha("go()")]);
		expect(out).not.toContain("data-astlide-csp");
		const policy = out.match(/content="([^"]*)"/)?.[1] ?? "";
		expect(policy).toContain(`script-src 'self' ${sha("go()")}`);
		expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
		expect(policy).toContain("style-src 'self' 'unsafe-inline'");
	});

	it("leaves a policy of your own (unmarked) alone", () => {
		const html = page(meta("script-src 'unsafe-inline'", false), "<script>go()</script>");
		expect(withPageHashes(html, [sha("go()")])).toBe(html);
	});

	it("only counts a marked <meta> in <head>, not the marker as text or a <meta> in the body", () => {
		const text = page(
			meta("script-src 'self'", false),
			`<pre>&lt;meta data-astlide-csp&gt; data-astlide-csp</pre>`,
		);
		expect(markedCspMeta(text)).toBeUndefined();
		expect(withPageHashes(text, [sha("x")])).toBe(text);
		const inBody = page("", meta("script-src 'self'"));
		expect(markedCspMeta(inBody)).toBeUndefined();
		expect(markedCspMeta(page(meta(DEFAULT_DECK_CSP), ""))).toBeDefined();
	});
});

describe("hashBuiltPages", () => {
	function build() {
		const dir = mkdtempSync(join(tmpdir(), "astlide-csp-"));
		mkdirSync(join(dir, "deck", "1"), { recursive: true });
		writeFileSync(
			join(dir, "deck", "1", "index.html"),
			page(meta(DEFAULT_DECK_CSP), `${slide("<script>slideOwn()</script>")}<script>a()</script>`),
		);
		writeFileSync(
			join(dir, "deck", "2.html"),
			page(meta(DEFAULT_DECK_CSP), "<script>c()</script>"),
		);
		writeFileSync(join(dir, "other.html"), page("", "<script>b()</script>"));
		return dir;
	}
	const read = (dir: string, file: string) => readFileSync(join(dir, file), "utf8");

	it("allows Astlide's scripts on every page, not the slides' own", async () => {
		const dir = build();
		const result = await hashBuiltPages(dir, { mark: MARK });
		expect(result.pages).toBe(2);
		expect(result.blocked).toEqual([{ file: join(dir, "deck", "1", "index.html"), scripts: 1 }]);
		// Each page allows every page's scripts: slides are swapped in place.
		for (const file of [join("deck", "1", "index.html"), join("deck", "2.html")]) {
			expect(read(dir, file)).toContain(sha("a()"));
			expect(read(dir, file)).toContain(sha("c()"));
			expect(read(dir, file)).not.toContain(sha("slideOwn()"));
		}
		expect(read(dir, "other.html")).not.toContain("sha256");
	});

	it("allows slide scripts with slideScripts", async () => {
		const dir = build();
		const result = await hashBuiltPages(dir, { mark: MARK, slideScripts: true });
		expect(result.blocked).toEqual([]);
		expect(read(dir, join("deck", "2.html"))).toContain(sha("slideOwn()"));
	});
});

describe("slideContentComments", () => {
	it("marks content slides, not MDX", () => {
		expect(slideContentComments("src/content/decks/d/01.md").start).toMatch(/^<!--astlide-slide:/);
		expect(slideContentComments("src/content/decks/d/01.html").end).toMatch(
			/^<!--\/astlide-slide:/,
		);
		expect(slideContentComments("src/content/decks/d/talk.pptx").start).not.toBe("");
		expect(slideContentComments("src/content/decks/d/01.MDX")).toEqual({ start: "", end: "" });
	});
});

describe("cspHashable", () => {
	it("is true for the defaults only", () => {
		expect(cspHashable(true)).toBe(true);
		expect(cspHashable("true")).toBe(true);
		expect(cspHashable(false)).toBe(false);
		expect(cspHashable("default-src 'self'")).toBe(false);
	});
});

describe("template artwork", () => {
	it("is marked like slide content, so its scripts aren't hashed", () => {
		const { start: open, end: close } = slideContentComments(undefined);
		// Slide.astro wraps template art in the build's marks; with this test's mark:
		expect(open).toMatch(/^<!--astlide-slide:/);
		const art = `<div class="astlide-tpl-art"><!--${start}--><script>fromTemplate()</script><!--${end}--></div>`;
		const scripts = inlineScripts(page("", `<section class="slide">${art}</section>`), MARK);
		expect(scripts).toEqual([{ hash: sha("fromTemplate()"), inSlide: true }]);
		expect(close).toMatch(/^<!--\/astlide-slide:/);
	});
});
