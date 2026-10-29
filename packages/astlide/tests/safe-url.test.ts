import { describe, expect, it } from "vitest";
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
