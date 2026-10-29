import { withoutNotesComment } from "@astlide/core/utils/comment-notes";
import {
	SLIDE_SCRIPTS_VERSION,
	stripSlideContent,
	stripSlideScripts,
} from "@astlide/core/utils/slide-scripts";
import type { LoaderContext } from "astro/loaders";
import { parseFragment } from "parse5";
import { describe, expect, it } from "vitest";
import { withoutSlideScripts } from "../src/loader";

/** Every attribute name a browser would build from `html` (parse5 parses as browsers do). */
function attributeNames(html: string): string[] {
	const names: string[] = [];
	const walk = (node: {
		childNodes?: unknown[];
		attrs?: { name: string }[];
		content?: unknown;
	}) => {
		for (const attr of node.attrs ?? []) names.push(attr.name.toLowerCase());
		for (const child of (node.childNodes ?? []) as (typeof node)[]) walk(child);
		if (node.content) walk(node.content as typeof node);
	};
	walk(parseFragment(html, { scriptingEnabled: true }) as never);
	return names;
}

describe("stripSlideScripts", () => {
	it("removes scripts, handlers and script URLs", () => {
		const html = [
			`<h1 onclick="steal()">Title</h1>`,
			`<script>steal()</script>`,
			`<SCRIPT src="https://evil.example/x.js"></SCRIPT>`,
			`<img src="a.png" onerror="steal()">`,
			`<a href=" JaVaScRiPt:steal()">link</a>`,
			`<a href="java&#x09;script:steal()">tab</a>`,
			`<iframe srcdoc="<script>steal()</script>"></iframe>`,
			`<svg><script>steal()</script><a xlink:href="javascript:steal()"><text>x</text></a>`,
			`<animate attributeName="href" to="javascript:steal()"/><set attributeName="onclick" to="x"/></svg>`,
			`<object data="x.html"></object><embed src="x.html"><base href="https://evil.example/">`,
			`<meta http-equiv="refresh" content="0;url=https://evil.example/">`,
			`<form action="javascript:steal()"><button formaction="javascript:steal()">go</button></form>`,
			`<a href="data:text/html,<script>steal()</script>">data</a><img src="data:image/png;base64,AAAA">`,
		].join("\n");
		const out = stripSlideScripts(html);
		expect(out).not.toMatch(
			/steal|evil\.example|<script|onclick|onerror|srcdoc|<object|<embed|<base|http-equiv/i,
		);
		// What isn't a script stays.
		expect(out).toContain("<h1>Title</h1>");
		expect(out).toContain('<img src="a.png">');
		expect(out).toContain("<a>link</a>");
		expect(out).toContain("<text>x</text>");
		expect(out).toContain("<button>go</button>");
		expect(out).toContain("<a>data</a>");
		expect(out).toContain('<img src="data:image/png;base64,AAAA">');
	});

	it("leaves script-free HTML exactly as it is", () => {
		const html = `<div class="x" style="color: red">Ünïcode &amp; <b>bold</b><br><img __ASTRO_IMAGE_="{&quot;src&quot;:&quot;./a.png&quot;}"></div>`;
		expect(stripSlideScripts(html)).toBe(html);
	});

	it("keeps Astro's image markers when it does rewrite", () => {
		const out = stripSlideScripts(
			`<img __ASTRO_IMAGE_="{&quot;src&quot;:&quot;./a.png&quot;}" onload="x()">`,
		);
		expect(out).toContain("__ASTRO_IMAGE_=");
		expect(out).not.toContain("onload");
	});
});

describe("stripSlideScripts reads markup as a browser does", () => {
	const handlers = (html: string) =>
		attributeNames(stripSlideScripts(html)).filter((n) => n.startsWith("on"));

	it("CDATA in HTML content is a bogus comment ending at the first >", () => {
		expect(handlers(`<p>a</p><![CDATA[><img src=x onerror=steal()>]]>`)).toEqual([]);
	});

	it("noscript content is raw text, and noscript is dropped", () => {
		const out = stripSlideScripts(
			`<noscript><p title="</noscript><img src=x onerror=steal()>"></p></noscript>`,
		);
		expect(handlers(out)).toEqual([]);
		expect(out).not.toMatch(/noscript|onerror/i);
	});

	it("MathML / SVG integration points are where browsers put them", () => {
		for (const html of [
			`<math><title><style><img src=x onerror=steal()>`,
			`<svg><mi><style><img src=x onerror=steal()>`,
			`<math><mtext><table><mglyph><style><img src=x onerror=steal()>`,
			`<svg></p><style><a id="</style><img src=1 onerror=steal()>">`,
			`<form><math><mtext></form><form><mglyph><style></math><img src onerror=steal()>`,
		])
			expect(handlers(html), html).toEqual([]);
	});

	it("keeps only image options in Astro's image placeholders, with Astro's spelling", () => {
		const json = JSON.stringify({
			src: "./a.png",
			alt: "A",
			index: 0,
			onError: "steal()",
			srcdoc: "x",
		});
		const out = stripSlideScripts(`<img __ASTRO_IMAGE_="${json.replaceAll('"', "&quot;")}">`);
		const value = /__ASTRO_IMAGE_="([^"]*)"/.exec(out)?.[1]?.replaceAll("&quot;", '"');
		expect(JSON.parse(value ?? "null")).toEqual({ src: "./a.png", alt: "A", index: 0 });
	});

	it("no data: documents in frames", () => {
		const out = stripSlideScripts(
			`<iframe src="data:image/svg+xml,<svg onload=steal()>"></iframe>`,
		);
		expect(out).not.toContain("data:");
	});
});

describe("stripSlideContent (the page pass)", () => {
	const mark = "m1";
	const start = `<!--astlide-slide:${mark}-->`;
	const end = `<!--/astlide-slide:${mark}-->`;

	it("cleans only what is between the marks, and closes what the slide left open", () => {
		const page = `<script>layout()</script>${start}<p onclick=steal()>x<textarea>${end}<script>layout2()</script>`;
		const out = stripSlideContent(page, mark);
		expect(out.startsWith("<script>layout()</script>")).toBe(true);
		expect(out.endsWith(`${end}<script>layout2()</script>`)).toBe(true);
		expect(out).not.toContain("onclick");
		expect(out).toContain("</textarea>");
	});

	it("leaves a page without marks alone", () => {
		const page = `<p onclick=x()>not a slide</p>`;
		expect(stripSlideContent(page, mark)).toBe(page);
	});
});

describe("withoutNotesComment", () => {
	it("removes the notes comment wherever it ends up in the rendered HTML", () => {
		const notes = "Secret plan";
		for (const html of [
			`<p>Hi<sup><a href="#fn1">1</a></sup></p>\n<!-- Secret plan -->\n<section data-footnotes><ol><li>fn</li></ol></section>`,
			`<ul>\n<li>item\n<!--\n  Secret plan\n-->\n</li>\n</ul>`,
			`<blockquote>\n<!-- Secret plan -->\n</blockquote>`,
		]) {
			const out = withoutNotesComment(html, notes);
			expect(out, html).not.toBeNull();
			expect(out).not.toContain("Secret");
		}
	});

	it("doesn't touch comments that aren't the notes, or text that only looks like one", () => {
		expect(withoutNotesComment(`<p title="<!-- Secret plan -->">x</p>`, "Secret plan")).toBeNull();
		expect(withoutNotesComment(`<!-- other -->`, "Secret plan")).toBeNull();
	});
});

describe("withoutSlideScripts", () => {
	function context() {
		const entries = new Map<
			string,
			{ id: string; filePath?: string; rendered?: { html: string } }
		>();
		const store = {
			set: (entry: { id: string }) => {
				entries.set(entry.id, entry);
				return true;
			},
			get: (id: string) => entries.get(id),
			entries: () => entries.entries(),
		};
		return { entries, ctx: withoutSlideScripts({ store } as unknown as LoaderContext) };
	}
	const html = `<p onclick="steal()">Hi</p><script>steal()</script>`;

	it("cleans Markdown, HTML and PowerPoint slides as they are stored", () => {
		const { entries, ctx } = context();
		for (const filePath of ["decks/a/01.md", "decks/a/02.html", "decks/a/03.pptx"])
			ctx.store.set({ id: filePath, filePath, data: {}, rendered: { html } } as never);
		for (const entry of entries.values()) expect(entry.rendered?.html).toBe("<p>Hi</p>");
	});

	it("leaves MDX slides alone (they are code)", () => {
		const { entries, ctx } = context();
		ctx.store.set({ id: "m", filePath: "decks/a/04.mdx", data: {}, rendered: { html } } as never);
		expect(entries.get("m")?.rendered?.html).toBe(html);
	});

	it("keeps the rest of the store working", () => {
		const { ctx } = context();
		ctx.store.set({
			id: "x",
			filePath: "decks/a/01.md",
			data: {},
			rendered: { html: "<p>ok</p>" },
		} as never);
		expect(ctx.store.get("x")?.rendered?.html).toBe("<p>ok</p>");
		expect([...ctx.store.entries()]).toHaveLength(1);
	});

	it("marks cleaned entries, and has older ones rendered again", () => {
		const { entries, ctx } = context();
		ctx.store.set({
			id: "a",
			filePath: "decks/a/01.md",
			digest: "d1",
			data: {},
			rendered: { html: "<p>x</p>" },
		} as never);
		expect((entries.get("a") as { digest?: string }).digest).toBe(
			`d1:scripts-${SLIDE_SCRIPTS_VERSION}`,
		);
		expect(ctx.store.get("a")?.digest).toBe("d1");
		// Cached before (or with slideScripts on): no mark, so it looks changed.
		entries.set("b", {
			id: "b",
			filePath: "decks/a/02.md",
			digest: "d2",
			rendered: { html: "<p>y</p>" },
		} as never);
		expect(ctx.store.get("b")?.digest).toBeUndefined();
	});
});
