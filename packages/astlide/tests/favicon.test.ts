import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveFavicon } from "../src/utils/favicon";

describe("resolveFavicon", () => {
	let publicDir: string;

	beforeEach(() => {
		publicDir = mkdtempSync(join(tmpdir(), "astlide-favicon-"));
	});

	afterEach(() => {
		rmSync(publicDir, { recursive: true, force: true });
	});

	it("uses an explicit path or URL as is", () => {
		expect(resolveFavicon("/logo.png", publicDir)).toBe("/logo.png");
		expect(resolveFavicon("https://cdn.example/icon.svg", publicDir)).toBe(
			"https://cdn.example/icon.svg",
		);
	});

	it("returns false when disabled", () => {
		writeFileSync(join(publicDir, "favicon.svg"), "<svg/>");
		expect(resolveFavicon(false, publicDir)).toBe(false);
	});

	it("finds favicon.svg, .ico or .png in public/, in that order", () => {
		writeFileSync(join(publicDir, "favicon.png"), "");
		expect(resolveFavicon(undefined, publicDir)).toBe("/favicon.png");
		writeFileSync(join(publicDir, "favicon.ico"), "");
		expect(resolveFavicon(undefined, publicDir)).toBe("/favicon.ico");
		writeFileSync(join(publicDir, "favicon.svg"), "<svg/>");
		expect(resolveFavicon(undefined, publicDir)).toBe("/favicon.svg");
	});

	it("returns null (empty icon) when public/ has none", () => {
		expect(resolveFavicon(undefined, publicDir)).toBeNull();
		expect(resolveFavicon(undefined, join(publicDir, "missing"))).toBeNull();
	});
});
