/**
 * The layout engine against Chromium on the playground's decks: the number of
 * boxes where the engine starts to differ (scripts/engine-parity.ts) must not
 * go above e2e/engine-parity-baseline.json. When the engine gets closer,
 * lower the baseline (per platform: Chromium's fallback fonts differ).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, inject, it } from "vitest";
import { compareDeck } from "../scripts/engine-parity";
import { useBrowser } from "./helpers/browser";

const browser = useBrowser();
const baselines: Record<string, Record<string, number>> = JSON.parse(
	readFileSync(resolve("e2e/engine-parity-baseline.json"), "utf-8"),
);
// Per platform: Chromium's fallback fonts differ between them.
const baseline = baselines[process.platform] ?? baselines.linux ?? {};

describe("layout engine vs Chromium, playground decks", () => {
	for (const deck of Object.keys(baseline))
		it(`${deck}: no more differences than the baseline`, async () => {
			const report = await compareDeck(
				browser(),
				inject("baseUrl"),
				resolve("playground/dist"),
				deck,
			);
			const starts = report.differences.filter((d) => d.own);
			const worst = starts
				.sort((a, b) => b.amount - a.amount)
				.map((d) => `slide ${d.slide} ${d.element}: engine ${d.engine}, Chromium ${d.chromium}`);
			// Every run: the differences on CI's platform can't be reproduced elsewhere.
			console.log(
				[
					`${deck}: ${report.own} boxes where the difference starts (baseline ${baseline[deck]})`,
					...worst.map((w) => `  ${w}`),
				].join("\n"),
			);
			expect(report.own, worst.slice(0, 5).join("\n")).toBeLessThanOrEqual(baseline[deck] ?? 0);
		}, 120_000);
});
