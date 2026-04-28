#!/usr/bin/env node
/**
 * Measure MDX → dev-server reflect latency.
 *
 * Astro content-collection MDX changes flow through the glob-loader and trigger
 * a re-render, not Vite client-side HMR. So we measure the user-visible signal:
 *   edit MDX → next request to the slide returns the new content.
 *
 * Workflow per iteration:
 *   1. Generate a unique marker.
 *   2. Append it to the target MDX file.
 *   3. Poll GET /example-deck/2 until the response HTML contains the marker.
 *   4. Record elapsed ms.
 *
 * Usage: bun run dev (in another terminal), then `node scripts/measure-hmr.mjs`.
 * Env: BASE_URL (default http://localhost:4321), DECK (default example-deck), ITERATIONS (default 10).
 *
 * Decision gate: if the median is comfortably below 1s, no HMR-specific
 * optimisation is warranted (defer until measured pain emerges).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const DECK = process.env.DECK ?? "example-deck";
const ITERATIONS = Number(process.env.ITERATIONS ?? 10);
const MDX = resolve(process.cwd(), `playground/src/content/decks/${DECK}/02-intro.mdx`);
const TARGET_URL = `${BASE_URL}/${DECK}/2`;
const POLL_INTERVAL_MS = 25;
const TIMEOUT_MS = 10_000;

async function fetchText(url) {
	const res = await fetch(url);
	return res.text();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollForMarker(marker) {
	const start = Date.now();
	while (Date.now() - start < TIMEOUT_MS) {
		const body = await fetchText(TARGET_URL).catch(() => "");
		if (body.includes(marker)) return Date.now() - start;
		await sleep(POLL_INTERVAL_MS);
	}
	return -1;
}

async function measure() {
	// Warm the server so the first sample isn't dominated by cold-start.
	await fetchText(TARGET_URL).catch(() => null);

	const original = readFileSync(MDX, "utf-8");
	const samples = [];
	try {
		for (let i = 0; i < ITERATIONS; i++) {
			// Plain-text marker survives MDX rendering and shows up verbatim in the HTML output.
			const marker = `HMRMARK${Date.now()}${i}`;
			writeFileSync(MDX, `${original}\n\n${marker}\n`);
			const elapsed = await pollForMarker(marker);
			samples.push(elapsed);
			// Brief settle to avoid back-to-back glob-loader reloads racing.
			await sleep(150);
		}
	} finally {
		writeFileSync(MDX, original);
	}

	const valid = samples.filter((s) => s >= 0).sort((a, b) => a - b);
	const failed = samples.length - valid.length;
	if (valid.length === 0) {
		console.error("All iterations timed out — is the dev server running?");
		process.exit(1);
	}
	const median = valid[Math.floor(valid.length / 2)];
	const p95 = valid[Math.min(valid.length - 1, Math.floor(valid.length * 0.95))];
	const max = valid[valid.length - 1];

	console.log(`HMR (server reflect) latency over ${ITERATIONS} iterations (ms):`);
	console.log(`  samples : ${samples.join(", ")}`);
	console.log(`  median  : ${median}`);
	console.log(`  p95     : ${p95}`);
	console.log(`  max     : ${max}`);
	if (failed > 0) console.log(`  timeouts: ${failed}`);
	console.log(
		median < 1000
			? "✓ Median < 1s — no HMR optimisation work warranted."
			: "⚠ Median ≥ 1s — investigate slide-content invalidation paths.",
	);
}

measure().catch((e) => {
	console.error(e);
	process.exit(1);
});
