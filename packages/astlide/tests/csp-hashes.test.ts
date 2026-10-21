import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cspHashable, DEFAULT_DECK_CSP } from "@astlide/core/utils/csp.ts";
import {
	hashBuiltPages,
	hashPageScripts,
	inlineScriptHashes,
	withScriptHashes,
} from "@astlide/core/utils/csp-hashes.ts";
import { describe, expect, it } from "vitest";

const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;

const page = (head: string, body: string) =>
	`<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
const meta = (policy: string, marked = true) =>
	`<meta http-equiv="Content-Security-Policy" content="${policy}"${marked ? " data-astlide-csp" : ""}>`;

describe("inlineScriptHashes", () => {
	it("hashes the exact text of inline scripts, once each, and skips external ones", () => {
		const a = "\n  console.log('a < b && </p>');\n";
		const html = page(
			'<script type="module" src="/x.js"></script>',
			`<script>${a}</script><SCRIPT type="module">b()</SCRIPT><script>${a}</script><svg><script>c()</script></svg>`,
		);
		expect(inlineScriptHashes(html)).toEqual([sha(a), sha("b()"), sha("c()")]);
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

describe("hashPageScripts", () => {
	it("rewrites the marked policy and drops the marker", () => {
		const out = hashPageScripts(page(meta(DEFAULT_DECK_CSP), "<script>go()</script>"));
		expect(out).not.toContain("data-astlide-csp");
		const policy = out.match(/content="([^"]*)"/)?.[1] ?? "";
		expect(policy).toContain(`script-src 'self' ${sha("go()")}`);
		expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
		expect(policy).toContain("style-src 'self' 'unsafe-inline'");
	});

	it("leaves a policy of your own (unmarked) alone", () => {
		const html = page(meta("script-src 'unsafe-inline'", false), "<script>go()</script>");
		expect(hashPageScripts(html)).toBe(html);
	});

	it("hashes scripts a slide brings too", () => {
		const out = hashPageScripts(
			page(meta(DEFAULT_DECK_CSP), '<section class="slide"><script>slideOwn()</script></section>'),
		);
		expect(out).toContain(sha("slideOwn()"));
	});
});

describe("hashBuiltPages", () => {
	it("rewrites marked pages in a build folder", async () => {
		const dir = mkdtempSync(join(tmpdir(), "astlide-csp-"));
		mkdirSync(join(dir, "deck", "1"), { recursive: true });
		writeFileSync(
			join(dir, "deck", "1", "index.html"),
			page(meta(DEFAULT_DECK_CSP), "<script>a()</script>"),
		);
		writeFileSync(join(dir, "other.html"), page("", "<script>b()</script>"));
		writeFileSync(
			join(dir, "deck", "2.html"),
			page(meta(DEFAULT_DECK_CSP), "<script>c()</script>"),
		);
		expect(await hashBuiltPages(dir)).toBe(2);
		// Each page allows every page's scripts: slides are swapped in place.
		for (const file of [join("deck", "1", "index.html"), join("deck", "2.html")]) {
			const html = readFileSync(join(dir, file), "utf8");
			expect(html).toContain(sha("a()"));
			expect(html).toContain(sha("c()"));
		}
		expect(readFileSync(join(dir, "other.html"), "utf8")).not.toContain("sha256");
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
