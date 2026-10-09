import { describe, expect, it } from "vitest";
import { withDevDirectives } from "../src/utils/csp";

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
