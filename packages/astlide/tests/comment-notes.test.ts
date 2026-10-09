import { describe, expect, it } from "vitest";
import {
	astlideCommentNotesPlugin,
	extractCommentNotes,
	stripTrailingComment,
} from "../src/utils/comment-notes";

describe("extractCommentNotes", () => {
	it("reads a comment that ends the slide", () => {
		expect(extractCommentNotes("# Hi\n\nBody\n\n<!-- Say hello -->\n")).toBe("Say hello");
	});

	it("dedents and trims multi-line comments, keeping Markdown", () => {
		const body = "# Hi\n\n<!--\n  First **point**\n\n  - a\n  - b\n-->\n\n";
		expect(extractCommentNotes(body)).toBe("First **point**\n\n- a\n- b");
	});

	it("uses only the last comment", () => {
		expect(extractCommentNotes("<!-- draft -->\n# Hi\n<!-- notes -->")).toBe("notes");
	});

	it("ignores comments that don't end the slide", () => {
		expect(extractCommentNotes("<!-- draft -->\n# Hi")).toBeUndefined();
		expect(extractCommentNotes("# Hi\n<!-- a -->\nmore text")).toBeUndefined();
	});

	it("ignores empty comments and bodies without one", () => {
		expect(extractCommentNotes("# Hi\n<!--   -->")).toBeUndefined();
		expect(extractCommentNotes("# Hi")).toBeUndefined();
		expect(extractCommentNotes("")).toBeUndefined();
	});

	it("ignores a comment inside a closing code fence", () => {
		expect(extractCommentNotes("```html\n<!-- x -->\n```\n")).toBeUndefined();
	});
});

describe("stripTrailingComment", () => {
	it("removes the trailing comment but keeps its line breaks", () => {
		const source = "---\na: 1\n---\n# Hi\n\n<!--\nnotes\n-->\n";
		const stripped = stripTrailingComment(source);
		expect(stripped).toBe("---\na: 1\n---\n# Hi\n\n\n\n\n");
		expect(stripped?.split("\n").length).toBe(source.split("\n").length);
	});

	it("returns null without a trailing comment", () => {
		expect(stripTrailingComment("# Hi\n<!-- a -->\ntext")).toBeNull();
	});
});

describe("astlideCommentNotesPlugin", () => {
	const transform = astlideCommentNotesPlugin().transform as (
		code: string,
		id: string,
	) => { code: string } | null;

	it("strips the trailing comment from .mdx modules", () => {
		expect(transform("# Hi\n<!-- n -->", "/p/01.mdx")?.code).toBe("# Hi\n");
		expect(transform("# Hi\n<!-- n -->", "/p/01.mdx?astroContentCollectionEntry=true")?.code).toBe(
			"# Hi\n",
		);
	});

	it("leaves other files alone", () => {
		expect(transform("# Hi\n<!-- n -->", "/p/01.md")).toBeNull();
		expect(transform("<!-- n -->", "/p/page.astro")).toBeNull();
	});
});
