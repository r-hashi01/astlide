import { describe, expect, it } from "vitest";
import { sanitizeBackground, sanitizeHTML, sanitizeKaTeXOutput } from "../src/utils/sanitize";

describe("sanitizeHTML", () => {
	// ── Safe content is preserved ──

	it("returns empty string for empty input", () => {
		expect(sanitizeHTML("")).toBe("");
	});

	it("preserves plain text", () => {
		expect(sanitizeHTML("Hello world")).toBe("Hello world");
	});

	it("preserves allowed inline tags", () => {
		const input = "<b>bold</b> and <em>italic</em> and <code>code</code>";
		expect(sanitizeHTML(input)).toBe(input);
	});

	it("preserves allowed block tags", () => {
		const input = "<p>paragraph</p><ul><li>item</li></ul>";
		expect(sanitizeHTML(input)).toBe(input);
	});

	it("preserves safe anchor links", () => {
		const input = '<a href="https://example.com">link</a>';
		expect(sanitizeHTML(input)).toContain("https://example.com");
	});

	it("preserves mailto links", () => {
		const input = '<a href="mailto:user@example.com">email</a>';
		expect(sanitizeHTML(input)).toContain("mailto:user@example.com");
	});

	it("preserves heading tags", () => {
		const input = "<h1>Title</h1><h2>Sub</h2>";
		expect(sanitizeHTML(input)).toBe(input);
	});

	it("preserves blockquote", () => {
		const input = "<blockquote>quoted</blockquote>";
		expect(sanitizeHTML(input)).toBe(input);
	});

	it("preserves strong and mark", () => {
		const input = "<strong>strong</strong> <mark>marked</mark>";
		expect(sanitizeHTML(input)).toBe(input);
	});

	// ── Dangerous tags are removed ──

	it("removes <script> tags and their content", () => {
		const input = '<p>text</p><script>alert("xss")</script>';
		const result = sanitizeHTML(input);
		expect(result).not.toContain("<script");
		expect(result).not.toContain("alert");
		expect(result).toContain("<p>text</p>");
	});

	it("removes <script> with attributes", () => {
		const input = '<script src="evil.js"></script>';
		expect(sanitizeHTML(input)).not.toContain("<script");
	});

	it("removes <iframe> tags", () => {
		const input = '<iframe src="https://evil.com"></iframe>';
		expect(sanitizeHTML(input)).not.toContain("<iframe");
	});

	it("removes <object> and <embed> tags", () => {
		expect(sanitizeHTML("<object data='x'></object>")).not.toContain("<object");
		expect(sanitizeHTML("<embed src='x'>")).not.toContain("<embed");
	});

	it("removes <form>, <input>, <textarea> tags", () => {
		const input = "<form><input type='text'><textarea></textarea></form>";
		const result = sanitizeHTML(input);
		expect(result).not.toContain("<form");
		expect(result).not.toContain("<input");
		expect(result).not.toContain("<textarea");
	});

	it("removes <style> tag and its content", () => {
		const input = "<style>body { display: none }</style><p>text</p>";
		const result = sanitizeHTML(input);
		expect(result).not.toContain("<style");
		expect(result).not.toContain("display: none");
	});

	it("removes unknown / disallowed tags but keeps their content", () => {
		// Unknown tags stripped, inner text preserved
		const result = sanitizeHTML("<custom-tag>text</custom-tag>");
		expect(result).not.toContain("<custom-tag");
		expect(result).toContain("text");
	});

	// ── Dangerous attributes are removed ──

	it("removes onclick event handlers", () => {
		const input = '<p onclick="alert(1)">text</p>';
		const result = sanitizeHTML(input);
		expect(result).not.toContain("onclick");
		expect(result).toContain("<p>");
	});

	it("removes onerror event handlers", () => {
		const input = '<img onerror="alert(1)" src="x">';
		const result = sanitizeHTML(input);
		expect(result).not.toContain("onerror");
	});

	it("removes all on* event handlers", () => {
		const handlers = ["onload", "onmouseover", "onfocus", "onblur", "onkeydown"];
		for (const handler of handlers) {
			const input = `<p ${handler}="evil()">text</p>`;
			expect(sanitizeHTML(input)).not.toContain(handler);
		}
	});

	it("removes disallowed attributes but keeps the tag", () => {
		const input = '<p style="color:red" data-x="y">text</p>';
		const result = sanitizeHTML(input);
		expect(result).not.toContain("style=");
		expect(result).toContain("<p>");
		expect(result).toContain("text");
	});

	// ── Dangerous URL protocols are removed ──

	it("removes javascript: protocol from href", () => {
		const input = '<a href="javascript:alert(1)">click</a>';
		const result = sanitizeHTML(input);
		expect(result).not.toContain("javascript:");
	});

	it("removes vbscript: protocol from href", () => {
		const input = '<a href="vbscript:msgbox(1)">click</a>';
		const result = sanitizeHTML(input);
		expect(result).not.toContain("vbscript:");
	});

	it("removes data: URIs in href when not image safe", () => {
		const input = '<a href="data:text/html,<script>alert(1)</script>">x</a>';
		const result = sanitizeHTML(input);
		expect(result).not.toContain("data:text/html");
	});

	// ── Nested dangerous tags ──

	it("removes nested script inside allowed tags", () => {
		const input = "<p>safe <script>evil()</script> text</p>";
		const result = sanitizeHTML(input);
		expect(result).not.toContain("<script");
		expect(result).not.toContain("evil");
	});

	it("handles multiple script tags", () => {
		const input = "<script>a()</script><p>text</p><script>b()</script>";
		const result = sanitizeHTML(input);
		expect(result).not.toContain("<script");
		expect(result).toContain("<p>text</p>");
	});
});

describe("sanitizeBackground", () => {
	// ── Safe values ──

	it("allows hex colors", () => {
		expect(sanitizeBackground("#1e293b")).toBe("#1e293b");
	});

	it("allows rgb/rgba colors", () => {
		expect(sanitizeBackground("rgb(255, 0, 0)")).toBe("rgb(255, 0, 0)");
		expect(sanitizeBackground("rgba(0,0,0,0.5)")).toBe("rgba(0,0,0,0.5)");
	});

	it("allows CSS named colors", () => {
		expect(sanitizeBackground("red")).toBe("red");
		expect(sanitizeBackground("transparent")).toBe("transparent");
	});

	it("allows linear-gradient", () => {
		const val = "linear-gradient(to right, #1e293b, #0f172a)";
		expect(sanitizeBackground(val)).toBe(val);
	});

	it("allows radial-gradient", () => {
		const val = "radial-gradient(circle, #fff, #000)";
		expect(sanitizeBackground(val)).toBe(val);
	});

	it("allows safe url()", () => {
		expect(sanitizeBackground("url(/images/bg.jpg)")).toBe("url(/images/bg.jpg)");
	});

	it("returns empty string for empty input", () => {
		expect(sanitizeBackground("")).toBe("");
	});

	// ── Dangerous values ──

	it("blocks CSS expression()", () => {
		expect(sanitizeBackground("expression(alert(1))")).toBe("");
	});

	it("blocks url(javascript:)", () => {
		expect(sanitizeBackground("url(javascript:alert(1))")).toBe("");
	});

	it("blocks url(vbscript:)", () => {
		expect(sanitizeBackground("url(vbscript:alert(1))")).toBe("");
	});

	it("blocks url(data:text/html)", () => {
		expect(sanitizeBackground("url(data:text/html,<script>)")).toBe("");
	});

	it("blocks url(data:image/svg+xml) with embedded script", () => {
		expect(sanitizeBackground("url('data:image/svg+xml,<svg onload=alert(1)>')")).toBe("");
	});

	it("blocks url(data:image/svg) with quoted variant", () => {
		expect(sanitizeBackground('url("data:image/svg+xml;base64,abc")')).toBe("");
	});

	it("blocks url(data:image/svg) case-insensitive", () => {
		expect(sanitizeBackground("url(DATA:IMAGE/SVG+XML,...)")).toBe("");
	});

	it("blocks @import", () => {
		expect(sanitizeBackground("@import url(evil.css)")).toBe("");
	});

	it("blocks CSS behavior property", () => {
		expect(sanitizeBackground("behavior: url(evil.htc)")).toBe("");
	});

	it("blocks curly braces (CSS injection attempt)", () => {
		expect(sanitizeBackground("red } body { display: none")).toBe("");
	});
});

describe("sanitizeKaTeXOutput", () => {
	// ── Safe content is preserved ──

	it("returns empty string for empty input", () => {
		expect(sanitizeKaTeXOutput("")).toBe("");
	});

	it("preserves plain text", () => {
		expect(sanitizeKaTeXOutput("E = mc²")).toBe("E = mc²");
	});

	it("preserves SVG elements", () => {
		const input = '<svg><path d="M0 0 L10 10"/></svg>';
		expect(sanitizeKaTeXOutput(input)).toBe(input);
	});

	it("preserves inline style attributes", () => {
		const input = '<span style="color: red; font-size: 12px;">x</span>';
		expect(sanitizeKaTeXOutput(input)).toBe(input);
	});

	it("preserves span with class", () => {
		const input = '<span class="katex-html">content</span>';
		expect(sanitizeKaTeXOutput(input)).toBe(input);
	});

	it("preserves complex KaTeX structure", () => {
		const input =
			'<span class="katex"><span class="katex-mathml"><math><mi>x</mi></math></span><span class="katex-html"><span style="height:0.4306em;">x</span></span></span>';
		expect(sanitizeKaTeXOutput(input)).toBe(input);
	});

	// ── Dangerous content is removed ──

	it("removes script tags and content", () => {
		const input = "<span>safe</span><script>alert(1)</script>";
		const result = sanitizeKaTeXOutput(input);
		expect(result).not.toContain("<script");
		expect(result).not.toContain("alert");
		expect(result).toContain("<span>safe</span>");
	});

	it("removes script tags inside SVG", () => {
		const input = "<svg><script>evil()</script><path d='M0 0'/></svg>";
		const result = sanitizeKaTeXOutput(input);
		expect(result).not.toContain("<script");
		expect(result).not.toContain("evil");
	});

	it("removes onclick event handlers", () => {
		const input = '<span onclick="alert(1)">x</span>';
		const result = sanitizeKaTeXOutput(input);
		expect(result).not.toContain("onclick");
		expect(result).toContain("<span");
		expect(result).toContain("x</span>");
	});

	it("removes onerror event handlers", () => {
		const input = '<img onerror="alert(1)" src="x">';
		const result = sanitizeKaTeXOutput(input);
		expect(result).not.toContain("onerror");
	});

	it("removes javascript: URLs from href", () => {
		const input = '<a href="javascript:alert(1)">link</a>';
		const result = sanitizeKaTeXOutput(input);
		expect(result).not.toContain("javascript:");
	});

	it("removes vbscript: URLs from xlink:href", () => {
		const input = '<use xlink:href="vbscript:evil()"/>';
		const result = sanitizeKaTeXOutput(input);
		expect(result).not.toContain("vbscript:");
	});
});
