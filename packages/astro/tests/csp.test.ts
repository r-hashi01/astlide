import { describe, expect, it } from "vitest";
import {
	cspFor,
	DEFAULT_DECK_CSP,
	DEFAULT_INDEX_CSP,
	withDevDirectives,
} from "../src/internal/csp";

describe("withDevDirectives", () => {
	const policy = "default-src 'self'; script-src 'self' 'unsafe-inline'";

	it("adds worker-src for blob: workers in dev", () => {
		expect(withDevDirectives(policy, true)).toBe(`${policy}; worker-src 'self' blob:`);
	});

	it("leaves production output unchanged", () => {
		expect(withDevDirectives(policy, false)).toBe(policy);
	});

	it("keeps a policy's own worker-src", () => {
		const own = "default-src 'self'; worker-src 'none'";
		expect(withDevDirectives(own, true)).toBe(own);
		expect(withDevDirectives("worker-src 'self'", true)).toBe("worker-src 'self'");
	});

	it("handles trailing semicolons and empty policies", () => {
		expect(withDevDirectives("default-src 'self';", true)).toBe(
			"default-src 'self'; worker-src 'self' blob:",
		);
		expect(withDevDirectives("", true)).toBe("worker-src 'self' blob:");
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
