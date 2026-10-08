import { codeToHtml } from "shiki";
import { describe, expect, it } from "vitest";
import { astlideCodeHighlight, parseHighlightMeta } from "../src/utils/code-highlight";

describe("parseHighlightMeta", () => {
	it("returns null without a range", () => {
		expect(parseHighlightMeta(undefined)).toBeNull();
		expect(parseHighlightMeta("")).toBeNull();
		expect(parseHighlightMeta('title="x.ts"')).toBeNull();
	});

	it("parses single lines, lists and ranges", () => {
		expect(parseHighlightMeta("{2}")).toEqual([[2]]);
		expect(parseHighlightMeta("{1,3-5, 8}")).toEqual([[1, 3, 4, 5, 8]]);
	});

	it("normalises reversed ranges, duplicates and order", () => {
		expect(parseHighlightMeta("{5-3,4,1}")).toEqual([[1, 3, 4, 5]]);
	});

	it("parses `|`-separated steps with all / *", () => {
		expect(parseHighlightMeta("{2|3-5|all}")).toEqual([[2], [3, 4, 5], "all"]);
		expect(parseHighlightMeta("{*|1}")).toEqual(["all", [1]]);
	});

	it("skips brace groups that are not ranges", () => {
		expect(parseHighlightMeta('title="{x}" {2|4}')).toEqual([[2], [4]]);
	});

	it("rejects malformed ranges", () => {
		expect(parseHighlightMeta("{2-}")).toBeNull();
		expect(parseHighlightMeta("{a,b}")).toBeNull();
		expect(parseHighlightMeta("{2||3}")).toBeNull();
	});
});

const CODE = "const a = 1;\nconst b = 2;\nconst c = 3;";

/** Class list of the line span with the given `data-line`. */
function lineClasses(html: string, line: number): string[] {
	const match = new RegExp(`<span class="([^"]*)" data-line="${line}"`).exec(html);
	return match ? match[1].split(" ") : [];
}

async function render(meta?: string): Promise<string> {
	return codeToHtml(CODE, {
		lang: "ts",
		theme: "github-dark",
		meta: meta ? { __raw: meta } : undefined,
		transformers: [astlideCodeHighlight()],
	});
}

describe("astlideCodeHighlight transformer", () => {
	it("leaves plain code blocks untouched", async () => {
		const html = await render();
		expect(html).not.toContain("has-highlighted");
		expect(html).not.toContain("data-line");
	});

	it("marks a static highlight", async () => {
		const html = await render("{2}");
		expect(html).toMatch(/<pre class="[^"]*has-highlighted/);
		expect(html).not.toContain("data-code-steps");
		expect(html).toContain('<span class="line highlighted" data-line="2"');
		expect(html).toContain('<span class="line" data-line="1"');
		expect(html).toContain('<span class="line" data-line="3"');
	});

	it("emits serialised steps and highlights the first segment", async () => {
		const html = await render("{1|2-3|all}");
		expect(html).toContain('data-code-steps="1|2,3|*"');
		expect(lineClasses(html, 1)).toContain("highlighted");
		expect(lineClasses(html, 2)).not.toContain("highlighted");
	});

	it("marks lines of the last step for the print view", async () => {
		const html = await render("{1|3}");
		expect(lineClasses(html, 1)).toEqual(["line", "highlighted"]);
		expect(lineClasses(html, 3)).toEqual(["line", "highlighted-last"]);
	});

	it("does not mark highlighted-last for static highlights", async () => {
		expect(await render("{2}")).not.toContain("highlighted-last");
	});

	it("highlights every line when the first segment is all", async () => {
		const html = await render("{all|2}");
		for (const line of [1, 2, 3]) expect(lineClasses(html, line)).toContain("highlighted");
	});
});
