#!/usr/bin/env node
/**
 * After `changeset version`: set each workspace's `version` in bun.lock to
 * the one in its package.json. `bun install` leaves them as they were, and
 * `bun pm pack` (scripts/release-pack.mjs) turns `workspace:*` dependencies
 * into the versions bun.lock records, so a stale entry would publish
 * packages that depend on the previous release (as 3.0.0 did).
 *
 * Only those `version` lines change; the rest of the lockfile is untouched.
 *
 * Usage: node scripts/sync-lock-versions.mjs
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const lockFile = join(root, "bun.lock");
const lines = readFileSync(lockFile, "utf-8").split("\n");

let changed = 0;
let workspace = null;
for (let i = 0; i < lines.length; i++) {
	// A workspace entry: `    "packages/next": {` (the root is `    "": {`).
	const start = /^ {4}"([^"]*)": \{$/.exec(lines[i]);
	if (start) {
		workspace = start[1];
		continue;
	}
	if (/^ {4}\}/.test(lines[i])) workspace = null;
	if (lines[i] === "  },") break; // end of "workspaces"
	if (!workspace) continue;
	const version = /^( {6}"version": )"([^"]*)",$/.exec(lines[i]);
	if (!version) continue;
	const pkgFile = join(root, workspace, "package.json");
	if (!existsSync(pkgFile)) continue;
	const current = JSON.parse(readFileSync(pkgFile, "utf-8")).version;
	if (current && current !== version[2]) {
		lines[i] = `${version[1]}"${current}",`;
		console.log(`${workspace}: ${version[2]} → ${current}`);
		changed++;
	}
}
if (changed) writeFileSync(lockFile, lines.join("\n"));
console.log(changed ? `${changed} workspace version(s) synced in bun.lock` : "bun.lock is in sync");
