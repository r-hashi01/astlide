import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { sanitizeNotesHtml } from "../src/runtime/notes-sanitize";
import { sanitizeHTML } from "../src/utils/sanitize";

const { window } = new JSDOM("");
const parser = new window.DOMParser();
const runtime = (html: string) => sanitizeNotesHtml(html, parser);

/** A sanitized fragment as a comparable tree: tags, sorted attributes, text. */
function tree(html: string): unknown {
	const walk = (node: Node): unknown => {
		if (node.nodeType === 3) return node.textContent;
		const el = node as Element;
		const attrs = Array.from(el.attributes)
			.map((a) => [a.name, a.value])
			.sort();
		return [el.tagName.toLowerCase(), attrs, Array.from(el.childNodes).map(walk)];
	};
	const body = parser.parseFromString(html, "text/html").body;
	return Array.from(body.childNodes).map(walk);
}

const CASES = [
	"<p>Plain <strong>bold</strong> and <em>em</em></p>",
	'<p id="config">clobber</p><a id="x" name="y">a</a>',
	'<a href="//evil.example/">protocol-relative</a>',
	'<a href="/\\evil.example/">backslash</a>',
	'<a href="/talk/2">path</a> <a href="#notes">hash</a> <a href="mailto:a@b.c">mail</a>',
	'<a href="https://astlide.dev/" target="_blank">new tab</a>',
	'<a href="https://astlide.dev/" target="_blank" rel="opener">rel replaced</a>',
	'<a href="javascript:alert(1)">js</a> <a href="java\tscript:alert(1)">tab</a>',
	'<a href=" &#x6a;avascript:alert(1)">entity</a>',
	'<img src="/photo.jpg" alt="Photo" width="10" onerror="alert(1)"><img src="//cdn/x.png">',
	'<p onclick="alert(1)" style="color:red" class="lead" data-fragment="1">attrs</p>',
	"<script>alert(1)</script><style>p{}</style><iframe src=x></iframe><p>after</p>",
	"<custom><b>kept</b> text</custom><font color=red>font</font>",
	"<p>before</p><!-- comment --><p>after comment</p>",
	"<ul><li>one</li><li>two <code>x &lt; y</code></li></ul>",
	'<table><tr><th scope="col" colspan="2">h</th></tr><tr><td rowspan="1">c</td></tr></table>',
];

describe("notes sanitizer (runtime) and sanitizeHTML (build)", () => {
	it.each(CASES)("agree on %s", (html) => {
		expect(tree(runtime(html))).toEqual(tree(sanitizeHTML(html)));
	});

	it("drops ids, protocol-relative and script URLs, and adds rel to a target", () => {
		const out = runtime(
			'<p id="config">x</p><a href="//evil.example/" target="_blank">y</a><a href="javascript:1">z</a>',
		);
		expect(out).not.toContain("id=");
		expect(out).not.toContain("evil.example");
		expect(out).not.toContain("javascript");
		expect(out).toContain('rel="noopener noreferrer"');
	});
});
