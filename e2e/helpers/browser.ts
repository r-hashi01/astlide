/**
 * Minimal agent-browser CLI wrapper for visual regression tests.
 *
 * Only the surface needed by `e2e/visual.test.ts` is exposed: viewport,
 * navigate, screenshot, close. Earlier helpers for keyboard / DOM queries
 * were removed when the navigation/fragments/ui-modes e2e suites were
 * dropped in favour of unit-level coverage.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const BASE_URL = "http://localhost:4321";
const BIN = resolve(__dirname, "../../node_modules/.bin/agent-browser");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function exec(args: string[]): string {
	const result = execFileSync(BIN, args, {
		encoding: "utf-8",
		timeout: 30_000,
	});
	return result.trim();
}

export function open(path: string): void {
	exec(["open", `${BASE_URL}${path}`]);
}

export function close(): void {
	try {
		exec(["close"]);
	} catch {
		// Browser may already be closed
	}
}

export function setViewport(width: number, height: number): void {
	exec(["set", "viewport", String(width), String(height)]);
}

/** Capture a full-page screenshot to the given absolute path. */
export function screenshot(path: string): void {
	exec(["screenshot", path]);
}

export { sleep };
