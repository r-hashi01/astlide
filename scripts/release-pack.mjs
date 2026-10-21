#!/usr/bin/env node
/**
 * Release build step: packs every public workspace package whose version
 * isn't on npm yet into `release/` (a tarball each) and writes
 * `release/manifest.json` with its release notes (the version's section of
 * its CHANGELOG.md). The publish job publishes those tarballs as they are —
 * it runs none of the repository's code.
 *
 * Usage: node scripts/release-pack.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = join(root, "release");
const ignored = new Set(
	JSON.parse(readFileSync(join(root, ".changeset", "config.json"), "utf-8")).ignore,
);

/** Whether `name@version` is already on npm. Only "not found" means no — other errors stop the release. */
function published(name, version) {
	try {
		execFileSync("npm", ["view", `${name}@${version}`, "version"], { stdio: "pipe" });
		return true;
	} catch (err) {
		if (/E404|404 Not Found/.test(String(err.stderr ?? err.message))) return false;
		throw err;
	}
}

/** The `## <version>` section of a CHANGELOG.md (without the heading). */
function notes(dir, version) {
	const file = join(dir, "CHANGELOG.md");
	if (!existsSync(file)) return "";
	const lines = readFileSync(file, "utf-8").split("\n");
	const start = lines.findIndex((l) => l.trim() === `## ${version}`);
	if (start < 0) return "";
	const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
	return lines
		.slice(start + 1, end < 0 ? undefined : end)
		.join("\n")
		.trim();
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
const manifest = [];
for (const entry of readdirSync(join(root, "packages"))) {
	const dir = join(root, "packages", entry);
	const pkgFile = join(dir, "package.json");
	if (!existsSync(pkgFile)) continue;
	const pkg = JSON.parse(readFileSync(pkgFile, "utf-8"));
	if (pkg.private || ignored.has(pkg.name)) continue;
	if (published(pkg.name, pkg.version)) continue;
	// --ignore-scripts: what gets published is what the build step produced.
	const file = execFileSync("npm", ["pack", "--ignore-scripts", "--pack-destination", out], {
		cwd: dir,
		encoding: "utf-8",
	})
		.trim()
		.split("\n")
		.pop();
	manifest.push({ name: pkg.name, version: pkg.version, file, notes: notes(dir, pkg.version) });
	console.log(`packed ${pkg.name}@${pkg.version} → ${file}`);
}
writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(manifest.length ? `${manifest.length} to publish` : "nothing to publish");
