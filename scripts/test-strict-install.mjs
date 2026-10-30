#!/usr/bin/env node
/**
 * Smoke test with a strict install: pack every public package, make an Astro
 * project (the create-astlide template), a Next.js project (playground-next)
 * and a Nuxt project (playground-nuxt) that depend only on the tarballs,
 * install each with `bun install --linker isolated` (the layout pnpm uses),
 * build it and export a deck to PDF, PNG and PPTX with the `astlide` tarball.
 *
 * Catches what a hoisted install hides: a package importing something it
 * doesn't depend on, or code that expects the project to see a transitive
 * dependency (#289, #296).
 *
 * Used by CI (.github/workflows/ci.yml `strict-install-smoke` job) and runnable
 * locally (needs Chromium for Playwright):
 *   node scripts/test-strict-install.mjs
 */

import { execFileSync, spawn } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const PACKAGES = {
	"@astlide/core": "packages/astlide",
	"@astlide/astro": "packages/astro",
	"@astlide/react": "packages/react",
	"@astlide/next": "packages/next",
	"@astlide/vue": "packages/vue",
	"@astlide/nuxt": "packages/nuxt",
	astlide: "packages/astlide-command",
};
const DECK = "example-deck";

function run(cmd, args, cwd, env) {
	console.log(`\n$ ${cmd} ${args.join(" ")}  (cwd=${cwd})`);
	execFileSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
}

const work = mkdtempSync(join(tmpdir(), "astlide-strict-install-"));
console.log(`Workspace: ${work}`);

/** Pack each package; bun's pack turns `workspace:` dependencies into versions, as publishing does. */
function packAll() {
	const tarballs = {};
	for (const [name, dir] of Object.entries(PACKAGES)) {
		const pkgDir = join(REPO_ROOT, dir);
		run("bun", ["pm", "pack", "--destination", work], pkgDir);
		const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf-8"));
		tarballs[name] =
			`file:${join(work, `${name.replace("@", "").replace("/", "-")}-${version}.tgz`)}`;
	}
	return tarballs;
}

/** Copy `from` to `<work>/<name>` and point its Astlide dependencies (direct and transitive) at the tarballs. */
function makeProject(name, from, direct, tarballs) {
	const dir = join(work, name);
	cpSync(from, dir, {
		recursive: true,
		filter: (src) => !/[\\/](node_modules|\.next|\.nuxt|\.output|dist)$/.test(src),
	});
	const pkgPath = join(dir, "package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
	pkg.dependencies[direct] = tarballs[direct];
	pkg.devDependencies = { ...pkg.devDependencies, astlide: tarballs.astlide };
	pkg.overrides = tarballs;
	writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
	run("bun", ["install", "--linker", "isolated"], dir);
	// Chromium for the export, matching the Playwright this project installed.
	const playwright = readdirSync(join(dir, "node_modules/.bun")).find((d) =>
		d.startsWith("playwright@"),
	);
	if (!playwright) throw new Error(`${name}: Playwright wasn't installed`);
	run(
		"node",
		[
			join(dir, "node_modules/.bun", playwright, "node_modules/playwright/cli.js"),
			"install",
			"chromium",
		],
		dir,
	);
	return dir;
}

/** The framework playgrounds read the Astro playground's decks; give the copy its own. */
function useOwnDeck(dir, configFile) {
	cpSync(join(REPO_ROOT, "playground/src/content/decks", DECK), join(dir, "decks", DECK), {
		recursive: true,
	});
	const file = join(dir, configFile);
	const text = readFileSync(file, "utf-8");
	if (!text.includes('"../playground/src/content/decks"')) {
		throw new Error(`${configFile} no longer reads ../playground/src/content/decks`);
	}
	writeFileSync(file, text.replace('"../playground/src/content/decks"', '"decks"'));
}

/** Start a server and wait until the deck's first slide answers. */
async function serve(cmd, args, cwd, port, env) {
	console.log(`\n$ ${cmd} ${args.join(" ")}  (cwd=${cwd}, port ${port})`);
	const child = spawn(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
	const url = `http://127.0.0.1:${port}`;
	for (let i = 0; i < 120; i++) {
		if (child.exitCode !== null) throw new Error(`Server exited with code ${child.exitCode}`);
		try {
			const res = await fetch(`${url}/${DECK}/1`);
			if (res.ok) return { url, stop: () => child.kill() };
		} catch {}
		await new Promise((r) => setTimeout(r, 500));
	}
	child.kill();
	throw new Error(`Server on ${url} didn't serve /${DECK}/1`);
}

/** Check the export wrote a PDF, and as many PNGs as PPTX slides. */
function checkExport(label, outDir) {
	if (!existsSync(join(outDir, `${DECK}.pdf`))) throw new Error(`${label}: no PDF`);
	const pngs = readdirSync(join(outDir, `${DECK}-slides`)).filter((f) => f.endsWith(".png"));
	const slides = execFileSync("unzip", ["-Z1", join(outDir, `${DECK}.pptx`)], { encoding: "utf-8" })
		.split("\n")
		.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
	if (pngs.length === 0 || pngs.length !== slides.length) {
		throw new Error(`${label}: ${pngs.length} PNG(s) but ${slides.length} PPTX slide(s)`);
	}
	console.log(`\n✓ ${label}: PDF, ${pngs.length} PNGs, ${slides.length} PPTX slides`);
}

// The decks are this repository's own: CI's Ubuntu runners can't start Chromium's
// sandbox (user namespaces), which the exporter otherwise insists on (as in e2e/).
const EXPORT_ENV = { ASTLIDE_CHROMIUM_SANDBOX: "0" };
const exportArgs = (outDir) => ["export", DECK, "--pdf", "--pptx", "--png", "--out-dir", outDir];

try {
	const tarballs = packAll();

	// Astro: the template, exported from the project with its own `export` script.
	const astro = makeProject(
		"astro",
		join(REPO_ROOT, "packages/create-astlide/template"),
		"@astlide/astro",
		tarballs,
	);
	run("bun", ["run", "build"], astro);
	run("bun", ["run", ...exportArgs(join(work, "astro-export"))], astro, EXPORT_ENV);
	checkExport("Astro", join(work, "astro-export"));

	// Next.js and Nuxt: build, serve, export from the site with the `astlide` command.
	const next = makeProject("next", join(REPO_ROOT, "playground-next"), "@astlide/next", tarballs);
	useOwnDeck(next, "lib/decks.ts");
	run("bun", ["run", "build"], next);
	const nextServer = await serve(
		join(next, "node_modules/.bin/next"),
		["start", "-H", "127.0.0.1", "-p", "4601"],
		next,
		4601,
	);
	try {
		run(
			join(next, "node_modules/.bin/astlide"),
			[...exportArgs(join(work, "next-export")), "--base-url", nextServer.url],
			next,
			EXPORT_ENV,
		);
	} finally {
		nextServer.stop();
	}
	checkExport("Next.js", join(work, "next-export"));

	const nuxt = makeProject("nuxt", join(REPO_ROOT, "playground-nuxt"), "@astlide/nuxt", tarballs);
	useOwnDeck(nuxt, "nuxt.config.ts");
	run("bun", ["run", "build"], nuxt);
	const nuxtServer = await serve("node", [".output/server/index.mjs"], nuxt, 4602, {
		HOST: "127.0.0.1",
		PORT: "4602",
	});
	try {
		run(
			join(nuxt, "node_modules/.bin/astlide"),
			[...exportArgs(join(work, "nuxt-export")), "--base-url", nuxtServer.url],
			nuxt,
			EXPORT_ENV,
		);
	} finally {
		nuxtServer.stop();
	}
	checkExport("Nuxt", join(work, "nuxt-export"));

	console.log("\n✓ Strict-install smoke test passed: Astro, Next.js and Nuxt.");
} finally {
	rmSync(work, { recursive: true, force: true });
}
