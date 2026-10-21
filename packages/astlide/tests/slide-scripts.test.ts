import type { LoaderContext } from "astro/loaders";
import { describe, expect, it } from "vitest";
import { withoutSlideScripts } from "../src/loader";
import { stripSlideScripts } from "../src/utils/slide-scripts";

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
});
