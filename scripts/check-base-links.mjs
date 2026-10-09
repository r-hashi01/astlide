#!/usr/bin/env node
/**
 * Verify a site built with Astro's `base` has no root-relative links that skip it.
 *
 * Usage: node scripts/check-base-links.mjs <distDir> <base>
 *   e.g. node scripts/check-base-links.mjs playground/dist /astlide
 *
 * Scans every .html file for href / src / data-next-src attributes starting with
 * "/" but not with the base, and exits non-zero listing them. Catches hand-built
 * URLs (`/${deck}/${n}`) that forgot `withBase()`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const [distDir, base] = process.argv.slice(2);
if (!distDir || !base) {
	console.error("Usage: node scripts/check-base-links.mjs <distDir> <base>");
	process.exit(2);
}

const prefix = base.replace(/\/+$/, "");
const ATTR = /\b(?:href|src|data-next-src)="(\/[^"]*)"/g;

function* htmlFiles(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* htmlFiles(path);
		else if (entry.name.endsWith(".html")) yield path;
	}
}

const offenders = [];
let files = 0;
for (const file of htmlFiles(distDir)) {
	files++;
	for (const [, url] of readFileSync(file, "utf-8").matchAll(ATTR)) {
		// Protocol-relative URLs ("//cdn…") are external.
		if (url.startsWith("//")) continue;
		if (url === prefix || url.startsWith(`${prefix}/`)) continue;
		offenders.push(`${relative(distDir, file)}: ${url}`);
	}
}

if (offenders.length > 0) {
	console.error(`✗ ${offenders.length} link(s) ignore base "${prefix}":`);
	for (const line of offenders) console.error(`  ${line}`);
	process.exit(1);
}
console.log(`✓ ${files} HTML file(s): every root-relative link starts with "${prefix}"`);
