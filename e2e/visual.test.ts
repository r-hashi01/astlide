/**
 * Visual regression tests.
 *
 * Captures screenshots of representative slide layouts and compares them
 * against committed baseline PNGs using pixelmatch.
 *
 * Workflow:
 *   - First run / intentional change: `UPDATE_SNAPSHOTS=1 bun run test:e2e`
 *     regenerates baseline images under `e2e/__snapshots__/visual/`.
 *   - Subsequent runs: each shot is diffed against the baseline. A diff PNG
 *     is written next to the actual on mismatch for easy inspection.
 *
 * Scope (v1, minimal): default theme × 3 representative layouts (cover,
 * two-column, code). Theme-specific shots can be added by registering more
 * fixtures here once we ship a multi-theme playground deck setup.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { close, open, screenshot, setViewport, sleep } from "./helpers/browser";

const VIEWPORT = { width: 1920, height: 1080 };
const SNAPSHOT_DIR = resolve(__dirname, "__snapshots__/visual");
const ACTUAL_DIR = resolve(__dirname, "__snapshots__/visual/actual");
const UPDATE = process.env.UPDATE_SNAPSHOTS === "1";

const FIXTURES: Array<{ name: string; path: string }> = [
	{ name: "default-cover", path: "/example-deck/1" },
	{ name: "default-two-column", path: "/example-deck/3" },
	{ name: "default-code", path: "/example-deck/4" },
];

function ensureDir(file: string): void {
	const dir = dirname(file);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readPng(path: string): PNG {
	return PNG.sync.read(readFileSync(path));
}

// Baselines are captured on macOS. The dedicated visual-regression workflow runs
// on macos-latest; running this suite on Linux (locally or in any other CI) would
// produce noisy false positives from font-rendering differences. Skip there.
const skipForFontDrift = process.platform !== "darwin";

describe.skipIf(skipForFontDrift)("visual regression — default theme", () => {
	beforeAll(() => {
		setViewport(VIEWPORT.width, VIEWPORT.height);
	});
	afterAll(() => {
		close();
	});

	for (const fixture of FIXTURES) {
		it(`matches baseline: ${fixture.name}`, async () => {
			open(fixture.path);
			// Allow ClientRouter transition + fonts + KaTeX to settle.
			await sleep(800);

			const baselinePath = resolve(SNAPSHOT_DIR, `${fixture.name}.png`);
			const actualPath = resolve(ACTUAL_DIR, `${fixture.name}.png`);
			ensureDir(actualPath);
			screenshot(actualPath);

			if (UPDATE || !existsSync(baselinePath)) {
				ensureDir(baselinePath);
				writeFileSync(baselinePath, readFileSync(actualPath));
				return;
			}

			const baseline = readPng(baselinePath);
			const actual = readPng(actualPath);
			expect({ w: actual.width, h: actual.height }).toEqual({
				w: baseline.width,
				h: baseline.height,
			});

			const diff = new PNG({ width: baseline.width, height: baseline.height });
			const mismatched = pixelmatch(
				baseline.data,
				actual.data,
				diff.data,
				baseline.width,
				baseline.height,
				{ threshold: 0.1 },
			);

			if (mismatched > 0) {
				const diffPath = resolve(ACTUAL_DIR, `${fixture.name}.diff.png`);
				writeFileSync(diffPath, PNG.sync.write(diff));
			}

			// Allow up to 0.1% pixel drift to account for sub-pixel font rendering jitter.
			const total = baseline.width * baseline.height;
			const ratio = mismatched / total;
			expect(ratio).toBeLessThan(0.001);
		});
	}
});
