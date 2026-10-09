import { codeToHtml } from "shiki";
import { describe, expect, it } from "vitest";
import { astlideCodeHighlight } from "../src/utils/code-highlight";
import { astlideMermaid, mermaidThemeFor } from "../src/utils/mermaid";

async function render(code: string, lang: string, meta?: string): Promise<string> {
	return codeToHtml(code, {
		lang,
		theme: "github-dark",
		meta: meta ? { __raw: meta } : undefined,
		transformers: [astlideCodeHighlight(), astlideMermaid()],
	});
}

describe("astlideMermaid transformer", () => {
	it("replaces a mermaid fence with a raw-source pre", async () => {
		const html = await render('flowchart LR\n  A["<b>x</b>"] --> B', "mermaid");
		expect(html).toBe(
			'<pre class="astlide-mermaid">flowchart LR\n  A["&#x3C;b>x&#x3C;/b>"] --> B</pre>',
		);
	});

	it("ignores line-highlight meta on mermaid fences", async () => {
		const html = await render("flowchart LR\n  A --> B", "mermaid", "{1|2}");
		expect(html).not.toContain("data-code-steps");
		expect(html.startsWith('<pre class="astlide-mermaid">')).toBe(true);
	});

	it("leaves other languages highlighted", async () => {
		const html = await render("const a = 1;", "ts");
		expect(html).not.toContain("astlide-mermaid");
		expect(html).toContain('<pre class="shiki');
	});
});

describe("mermaidThemeFor", () => {
	it("maps deck themes to mermaid themes", () => {
		expect(mermaidThemeFor("dark")).toBe("dark");
		expect(mermaidThemeFor("gradient")).toBe("dark");
		expect(mermaidThemeFor("forest")).toBe("forest");
		expect(mermaidThemeFor("default")).toBe("default");
		expect(mermaidThemeFor(undefined)).toBe("default");
	});
});
