import { afterEach, describe, expect, it, vi } from "vitest";

async function load(baseUrl: string) {
	vi.stubEnv("BASE_URL", baseUrl);
	vi.resetModules();
	return import("../src/utils/base-path");
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("withBase", () => {
	it("leaves paths untouched at the root", async () => {
		const { basePath, withBase } = await load("/");
		expect(basePath).toBe("");
		expect(withBase("/deck/1")).toBe("/deck/1");
		expect(withBase("/")).toBe("/");
	});

	it("prefixes a sub-path base with or without a trailing slash", async () => {
		for (const base of ["/astlide/", "/astlide"]) {
			const { basePath, withBase } = await load(base);
			expect(basePath).toBe("/astlide");
			expect(withBase("/deck/1")).toBe("/astlide/deck/1");
			expect(withBase("/")).toBe("/astlide/");
		}
	});

	it("adds the leading slash when missing", async () => {
		const { withBase } = await load("/astlide/");
		expect(withBase("deck/all")).toBe("/astlide/deck/all");
	});
});
