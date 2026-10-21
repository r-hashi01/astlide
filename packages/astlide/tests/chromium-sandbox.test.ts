import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chromiumSandbox, launchChromium } from "../src/cli/render";

afterEach(() => vi.unstubAllEnvs());

describe("Chromium sandbox", () => {
	it("is on unless ASTLIDE_CHROMIUM_SANDBOX=0", () => {
		expect(chromiumSandbox({})).toBe(true);
		expect(chromiumSandbox({ ASTLIDE_CHROMIUM_SANDBOX: "1" })).toBe(true);
		expect(chromiumSandbox({ ASTLIDE_CHROMIUM_SANDBOX: "0" })).toBe(false);
	});

	it.skipIf(!existsSync(chromium.executablePath()))(
		"launches Chromium without --no-sandbox",
		async () => {
			const launch = vi.spyOn(chromium, "launch");
			const browser = await launchChromium();
			await browser.close();
			expect(launch).toHaveBeenCalledWith({ chromiumSandbox: true });
			launch.mockRestore();
		},
	);
});
