#!/usr/bin/env node
/**
 * Verify a site built with Astro's `base` has no root-relative links that skip it.
 *
 * Usage: node scripts/check-base-links.mjs <distDir> <base> [--trailing-slash]
 *   e.g. node scripts/check-base-links.mjs playground/dist /astlide --trailing-slash
 *
 * Scans every .html file for href / src / data-next-src attributes starting with
 * "/" but not with the base, and exits non-zero listing them. Catches hand-built
 * URLs (`/${deck}/${n}`) that forgot `withBase()`.
 *
 * With --trailing-slash (directory-format builds), page links — paths whose
 * last segment has no file extension — must also end in "/", or static hosts
 * answer each one with a redirect. Catches URLs that skipped `pageUrl()`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const requireSlash = args.includes("--trailing-slash");
const [distDir, base] = args.filter((arg) => !arg.startsWith("--"));
if (!distDir || !base) {
	console.error("Usage: node scripts/check-base-links.mjs <distDir> <base> [--trailing-slash]");
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
		if (url !== prefix && !url.startsWith(`${prefix}/`)) {
			offenders.push(`${relative(distDir, file)}: ${url}`);
			continue;
		}
		if (requireSlash) {
			const path = url.split(/[?#]/)[0];
			const last = path.slice(path.lastIndexOf("/") + 1);
			if (last !== "" && !last.includes(".")) {
				offenders.push(`${relative(distDir, file)}: ${url} (no trailing slash)`);
			}
		}
	}
}

if (offenders.length > 0) {
	console.error(
		`✗ ${offenders.length} link(s) ignore base "${prefix}"${requireSlash ? " or lack a trailing slash" : ""}:`,
	);
	for (const line of offenders) console.error(`  ${line}`);
	process.exit(1);
}
console.log(
	`✓ ${files} HTML file(s): every root-relative link starts with "${prefix}"${requireSlash ? " and page links end in /" : ""}`,
);
