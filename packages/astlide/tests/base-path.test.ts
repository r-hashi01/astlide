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

describe("withBaseIfRootRelative", () => {
	it("prefixes root-relative asset paths only", async () => {
		const { withBaseIfRootRelative } = await load("/astlide/");
		expect(withBaseIfRootRelative("/photo.jpg")).toBe("/astlide/photo.jpg");
		expect(withBaseIfRootRelative("photo.jpg")).toBe("photo.jpg");
		expect(withBaseIfRootRelative("https://x.dev/a.png")).toBe("https://x.dev/a.png");
		expect(withBaseIfRootRelative("//cdn.x.dev/a.png")).toBe("//cdn.x.dev/a.png");
		expect(withBaseIfRootRelative("data:image/png;base64,AA")).toBe("data:image/png;base64,AA");
	});

	it("does not double-prefix", async () => {
		const { withBaseIfRootRelative } = await load("/astlide/");
		expect(withBaseIfRootRelative("/astlide/photo.jpg")).toBe("/astlide/photo.jpg");
		expect(withBaseIfRootRelative("/astlide")).toBe("/astlide");
	});

	it("is a no-op at the root", async () => {
		const { withBaseIfRootRelative } = await load("/");
		expect(withBaseIfRootRelative("/photo.jpg")).toBe("/photo.jpg");
	});
});
