#!/usr/bin/env node
/**
 * Type-check the playground's .astro / .ts files.
 *
 * The repo uses TypeScript 7 (native `tsc`), but `astro check` refuses to run
 * on it: @astrojs/language-server needs the JS compiler API that TS 7 dropped.
 * Until Astro's TS 7.1+ path (`@astrojs/ts-content-mapper` + `tsc
 * --runExternalCode`) is usable, drive the same checker `astro check` uses and
 * hand it the TypeScript 6 kept in the `tools/ts6` workspace.
 *
 * Usage: node scripts/typecheck.mjs   (run `astro sync` in playground first)
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AstroCheck } from "@astrojs/language-server";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = join(repoRoot, "playground");
const typescript6 = createRequire(join(repoRoot, "tools/ts6/package.json")).resolve("typescript");

const checker = new AstroCheck(workspace, typescript6, undefined);
const result = await checker.lint({ logErrors: { level: "hint" } });

console.info(
	`Result (${result.fileChecked} files): ${result.errors} errors, ${result.warnings} warnings, ${result.hints} hints`,
);
process.exit(result.errors > 0 ? 1 : 0);
