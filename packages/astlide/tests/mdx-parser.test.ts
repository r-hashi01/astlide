import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Element as HastElement } from "hast";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseMdxFile } from "../src/cli/pptx/mdx-parser";

/** Write MDX content to a temp file and return the path. */
function writeMdx(dir: string, content: string): string {
	const p = join(dir, "test.mdx");
	writeFileSync(p, content, "utf-8");
	return p;
}

/** Find first HAST element matching a tagName in root children. */
function findElement(children: unknown[], tagName: string): HastElement | undefined {
	return children.find(
		(c): c is HastElement =>
			(c as HastElement).type === "element" && (c as HastElement).tagName === tagName,
	);
}

/** Find all HAST elements matching a tagName in root children. */
function findElements(children: unknown[], tagName: string): HastElement[] {
	return children.filter(
		(c): c is HastElement =>
			(c as HastElement).type === "element" && (c as HastElement).tagName === tagName,
	);
}

describe("parseMdxFile", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "mdx-parser-test-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	// ── Frontmatter extraction ──

	describe("frontmatter", () => {
		it("extracts slideLayout from frontmatter", async () => {
			const p = writeMdx(tmpDir, "---\nslideLayout: cover\n---\n# Title\n");
			const result = await parseMdxFile(p);
			expect(result.frontmatter.slideLayout).toBe("cover");
		});

		it("returns empty frontmatter when none present", async () => {
			const p = writeMdx(tmpDir, "# Hello\n");
			const result = await parseMdxFile(p);
			expect(result.frontmatter).toEqual({});
		});

		it("extracts multiple frontmatter fields", async () => {
			const p = writeMdx(
				tmpDir,
				'---\nslideLayout: section\nbackground: "#1e293b"\nnotes: Speaker notes\nhidden: true\n---\n# Title\n',
			);
			const result = await parseMdxFile(p);
			expect(result.frontmatter.slideLayout).toBe("section");
			expect(result.frontmatter.background).toBe("#1e293b");
			expect(result.frontmatter.notes).toBe("Speaker notes");
			expect(result.frontmatter.hidden).toBe(true);
		});
	});

	// ── HAST structure ──

	describe("HAST structure", () => {
		it("produces root node with type 'root'", async () => {
			const p = writeMdx(tmpDir, "# Title\n");
			const result = await parseMdxFile(p);
			expect(result.hast.type).toBe("root");
		});

		it("converts heading to h1 element", async () => {
			const p = writeMdx(tmpDir, "# Title\n");
			const result = await parseMdxFile(p);
			const h1 = findElement(result.hast.children, "h1");
			expect(h1).toBeDefined();
		});

		it("converts paragraph to p element", async () => {
			const p = writeMdx(tmpDir, "# Title\n\nSome text\n");
			const result = await parseMdxFile(p);
			const para = findElement(result.hast.children, "p");
			expect(para).toBeDefined();
		});

		it("converts unordered list to ul element", async () => {
			const p = writeMdx(tmpDir, "- item 1\n- item 2\n");
			const result = await parseMdxFile(p);
			const ul = findElement(result.hast.children, "ul");
			expect(ul).toBeDefined();
			const lis = findElements(ul!.children, "li");
			expect(lis.length).toBe(2);
		});

		it("converts code fence to pre element", async () => {
			const p = writeMdx(tmpDir, "```ts\nconst x = 1;\n```\n");
			const result = await parseMdxFile(p);
			const pre = findElement(result.hast.children, "pre");
			expect(pre).toBeDefined();
			const code = findElement(pre!.children, "code");
			expect(code).toBeDefined();
		});
	});

	// ── JSX component conversion ──

	describe("JSX components", () => {
		it("converts block JSX to div with data-component", async () => {
			const p = writeMdx(tmpDir, "<Left>\nsome text\n</Left>\n");
			const result = await parseMdxFile(p);
			const divs = findElements(result.hast.children, "div");
			const left = divs.find((d) => d.properties.dataComponent === "Left");
			expect(left).toBeDefined();
		});

		it("extracts JSX string props as data-* attributes", async () => {
			const p = writeMdx(tmpDir, '<Math formula="E=mc^2" />\n');
			const result = await parseMdxFile(p);
			const divs = findElements(result.hast.children, "div");
			const math = divs.find((d) => d.properties.dataComponent === "Math");
			expect(math).toBeDefined();
			expect(math!.properties.dataFormula).toBe("E=mc^2");
		});

		it("handles boolean JSX props", async () => {
			const p = writeMdx(tmpDir, "<Math display />\n");
			const result = await parseMdxFile(p);
			const divs = findElements(result.hast.children, "div");
			const math = divs.find((d) => d.properties.dataComponent === "Math");
			expect(math).toBeDefined();
			expect(math!.properties.dataDisplay).toBe(true);
		});

		it("recursively converts children of JSX components to HAST", async () => {
			const p = writeMdx(tmpDir, "<Left>\n\n### Sub\n\n</Left>\n");
			const result = await parseMdxFile(p);
			const divs = findElements(result.hast.children, "div");
			const left = divs.find((d) => d.properties.dataComponent === "Left");
			expect(left).toBeDefined();
			const h3 = findElement(left!.children, "h3");
			expect(h3).toBeDefined();
		});
	});

	// ── Edge cases ──

	describe("edge cases", () => {
		it("skips import/export statements", async () => {
			const p = writeMdx(tmpDir, 'import Foo from "./Foo"\n\n# Title\n');
			const result = await parseMdxFile(p);
			// Should have h1 but no import node
			const h1 = findElement(result.hast.children, "h1");
			expect(h1).toBeDefined();
			// No elements should represent the import statement
			const elements = result.hast.children.filter(
				(c) => (c as HastElement).type === "element",
			) as HastElement[];
			const importEl = elements.find(
				(e) => e.tagName === "div" && String(e.properties?.dataComponent ?? "").includes("import"),
			);
			expect(importEl).toBeUndefined();
		});

		it("sets filePath on the returned ParsedSlide", async () => {
			const p = writeMdx(tmpDir, "# Title\n");
			const result = await parseMdxFile(p);
			expect(result.filePath).toBe(p);
		});
	});
});
