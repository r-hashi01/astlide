import { describe, expect, it } from "vitest";
import { cspFor, DEFAULT_DECK_CSP, DEFAULT_INDEX_CSP } from "../src/utils/csp";
import { httpUrl, imageUrl } from "../src/utils/safe-url";

describe("httpUrl / imageUrl", () => {
	it("keeps http(s) only", () => {
		expect(httpUrl("https://x.example/a")).toBe("https://x.example/a");
		for (const bad of [
			"javascript:alert(1)",
			" javascript:alert(1)",
			"data:text/html,x",
			"/relative",
			"",
			undefined,
		])
			expect(httpUrl(bad)).toBeUndefined();
	});

	it("accepts site paths and data:image for images, not other schemes or //", () => {
		expect(imageUrl("/a.png")).toBe("/a.png");
		expect(imageUrl("a.png")).toBe("a.png");
		expect(imageUrl("data:image/png;base64,AA")).toBe("data:image/png;base64,AA");
		for (const bad of [
			"javascript:alert(1)",
			"//evil.example/a.png",
			"/\\evil.example/a.png",
			"file:///etc/x",
		])
			expect(imageUrl(bad)).toBeUndefined();
	});
});

describe("cspFor", () => {
	it("hardens the default policies", () => {
		for (const policy of [DEFAULT_DECK_CSP, DEFAULT_INDEX_CSP])
			for (const d of ["base-uri 'self'", "form-action 'self'", "object-src 'none'"])
				expect(policy).toContain(d);
	});

	it("follows the csp option", () => {
		expect(cspFor(false, DEFAULT_DECK_CSP, false)).toBeNull();
		expect(cspFor("default-src 'none'", DEFAULT_DECK_CSP, false)).toBe("default-src 'none'");
		expect(cspFor(true, DEFAULT_DECK_CSP, true)).toContain("worker-src 'self' blob:");
	});

	it("builds the default policies without inline scripts (the build adds hashes)", () => {
		for (const policy of [DEFAULT_DECK_CSP, DEFAULT_INDEX_CSP]) {
			const built = cspFor(true, policy, false) ?? "";
			expect(built).toMatch(/script-src 'self'(;|$)/);
			expect(built.split(";").find((d) => d.trim().startsWith("script-src"))).not.toContain(
				"unsafe-inline",
			);
			// Styles keep it; dev keeps it for scripts too.
			expect(built).toContain("style-src 'self' 'unsafe-inline'");
			expect(cspFor(true, policy, true)).toContain("script-src 'self' 'unsafe-inline'");
		}
		// A policy of your own is used as is.
		expect(cspFor("script-src 'unsafe-inline'", DEFAULT_DECK_CSP, false)).toBe(
			"script-src 'unsafe-inline'",
		);
	});
});
