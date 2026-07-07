/**
 * Vitest globalSetup: starts the dev server before all e2e tests
 * and shuts it down after. Set REUSE_SERVER=1 to skip if already running.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import type { GlobalSetupContext } from "vitest/node";

// Port is configurable so the suite can run when the default 4321 is busy
// (e.g. another dev server). Keep it in sync with helpers/browser.ts via E2E_PORT.
const PORT = Number(process.env.E2E_PORT ?? 4321);
const URL = `http://localhost:${PORT}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async function setup(_ctx: GlobalSetupContext) {
	if (process.env.REUSE_SERVER) {
		try {
			const res = await fetch(URL);
			if (res.ok) return;
		} catch {
			// Not running, start it
		}
	}

	const proc: ChildProcess = spawn("bunx", ["astro", "dev", "--port", String(PORT)], {
		cwd: resolve(process.cwd(), "playground"),
		stdio: ["ignore", "ignore", "pipe"],
	});

	// Poll until server is ready
	const deadline = Date.now() + 60_000;
	let ready = false;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(URL);
			if (res.ok) {
				ready = true;
				break;
			}
		} catch {
			// Not ready yet
		}
		await sleep(500);
	}

	if (!ready) {
		proc.kill();
		throw new Error(`Dev server did not start within 60s at ${URL}`);
	}

	return async () => {
		proc.kill();
	};
}
