#!/usr/bin/env node
/**
 * Smoke test: pack @astlide/core, scaffold a fresh project from the create-astlide
 * template, swap in the local tarball, install, and build.
 *
 * Catches: template breakage, missing files in @astlide/core's `files` field,
 * broken `exports` map, peerDependency drift.
 *
 * Used by CI (.github/workflows/ci.yml `template-smoke` job) and runnable locally:
 *   node scripts/test-template.mjs
 */

import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const CORE_DIR = join(REPO_ROOT, "packages/astlide");
const TEMPLATE_DIR = join(REPO_ROOT, "packages/create-astlide/template");

function run(cmd, args, cwd) {
	console.log(`\n$ ${cmd} ${args.join(" ")}  (cwd=${cwd})`);
	execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

function captureStdout(cmd, args, cwd) {
	return execFileSync(cmd, args, { cwd, encoding: "utf-8" }).trim();
}

const work = mkdtempSync(join(tmpdir(), "astlide-template-smoke-"));
console.log(`Workspace: ${work}`);

try {
	// 1. Pack @astlide/core into a tarball — exercises the `files` field.
	run("npm", ["pack", "--pack-destination", work], CORE_DIR);
	const corePkg = JSON.parse(readFileSync(join(CORE_DIR, "package.json"), "utf-8"));
	const tarballName = `astlide-core-${corePkg.version}.tgz`;
	const tarballPath = join(work, tarballName);

	// 2. Copy template into a fresh project dir.
	const projectDir = join(work, "my-slides");
	cpSync(TEMPLATE_DIR, projectDir, { recursive: true });

	// A deck with a Markdown and an HTML slide: the template's loader must read
	// every slide format, not only .mdx.
	const deckDir = join(projectDir, "src/content/decks/smoke");
	mkdirSync(deckDir, { recursive: true });
	writeFileSync(join(deckDir, "_config.json"), JSON.stringify({ title: "Smoke" }));
	writeFileSync(join(deckDir, "01-markdown.md"), "# A Markdown slide\n");
	writeFileSync(join(deckDir, "02-html.html"), "<h1>An HTML slide</h1>\n");

	// 3. Repoint @astlide/core to the local tarball.
	const projPkgPath = join(projectDir, "package.json");
	const projPkg = JSON.parse(readFileSync(projPkgPath, "utf-8"));
	projPkg.dependencies["@astlide/core"] = `file:${tarballPath}`;
	writeFileSync(projPkgPath, JSON.stringify(projPkg, null, 2));

	// 4. Install with bun. --no-save to avoid lockfile drift in tests.
	run("bun", ["install"], projectDir);

	// 5. Build the scaffolded project.
	run("bun", ["run", "build"], projectDir);

	// 6. Sanity check: dist/ exists with at least one HTML page.
	const dist = join(projectDir, "dist");
	const pageCount = captureStdout("find", [dist, "-name", "*.html", "-type", "f"], projectDir)
		.split("\n")
		.filter(Boolean).length;
	if (pageCount === 0) {
		throw new Error(`Build produced no HTML pages in ${dist}`);
	}
	for (const slide of ["1", "2"]) {
		if (!existsSync(join(dist, "smoke", slide, "index.html"))) {
			throw new Error(`The .md / .html slide /smoke/${slide}/ was not built`);
		}
	}
	console.log(`\n✓ Template smoke test passed: ${pageCount} HTML page(s) generated.`);
} finally {
	rmSync(work, { recursive: true, force: true });
}
