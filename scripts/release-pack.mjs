#!/usr/bin/env node
/**
 * Release build step: packs every public workspace package whose version
 * isn't on npm yet and was bumped by the commit being built (compared with
 * its parent, so a later push can't publish an older pending release) into
 * `release/` (a tarball each) and writes `release/manifest.json` — in
 * dependency order, with each version's release notes (its section of
 * CHANGELOG.md). The publish job publishes those tarballs as they are — it
 * runs none of the repository's code.
 *
 * Usage: node scripts/release-pack.mjs
 *   RELEASE_ANY_UNPUBLISHED=1 — also pack versions bumped earlier (a manual
 *   run to finish a release that didn't publish).
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

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

/** The package's version in the parent commit, or null (new package, no parent). */
function previousVersion(dir) {
	try {
		const rel = relative(root, join(dir, "package.json")).split(sep).join("/");
		const text = execFileSync("git", ["show", `HEAD^:${rel}`], { cwd: root, stdio: "pipe" });
		return JSON.parse(String(text)).version ?? null;
	} catch {
		return null;
	}
}

/** `packages` with each one after the packed packages it depends on. */
function dependenciesFirst(packages) {
	const byName = new Map(packages.map((p) => [p.name, p]));
	const done = new Set();
	const out = [];
	const visit = (p, seen = new Set()) => {
		if (done.has(p.name) || seen.has(p.name)) return;
		seen.add(p.name);
		const deps = { ...p.dependencies, ...p.peerDependencies, ...p.optionalDependencies };
		for (const dep of Object.keys(deps)) {
			const d = byName.get(dep);
			if (d) visit(d, seen);
		}
		done.add(p.name);
		out.push(p);
	};
	for (const p of [...packages].sort((a, b) => a.name.localeCompare(b.name))) visit(p);
	return out;
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
const anyUnpublished = process.env.RELEASE_ANY_UNPUBLISHED === "1";
const candidates = [];
for (const entry of readdirSync(join(root, "packages"))) {
	const dir = join(root, "packages", entry);
	const pkgFile = join(dir, "package.json");
	if (!existsSync(pkgFile)) continue;
	const pkg = JSON.parse(readFileSync(pkgFile, "utf-8"));
	if (pkg.private || ignored.has(pkg.name)) continue;
	if (published(pkg.name, pkg.version)) continue;
	if (!anyUnpublished && previousVersion(dir) === pkg.version) {
		console.log(
			`skipped ${pkg.name}@${pkg.version}: not bumped by this commit (RELEASE_ANY_UNPUBLISHED=1 to include)`,
		);
		continue;
	}
	candidates.push({ ...pkg, dir });
}
const manifest = [];
for (const pkg of dependenciesFirst(candidates)) {
	// --ignore-scripts: what gets published is what the build step produced. bun's
	// pack, not npm's: it turns `workspace:*` dependencies into the versions.
	const file = basename(
		execFileSync("bun", ["pm", "pack", "--ignore-scripts", "--quiet", "--destination", out], {
			cwd: pkg.dir,
			encoding: "utf-8",
		})
			.trim()
			.split("\n")
			.pop() ?? "",
	);
	manifest.push({ name: pkg.name, version: pkg.version, file, notes: notes(pkg.dir, pkg.version) });
	console.log(`packed ${pkg.name}@${pkg.version} → ${file}`);
}
writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(manifest.length ? `${manifest.length} to publish` : "nothing to publish");
