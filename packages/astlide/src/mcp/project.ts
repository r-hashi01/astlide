/**
 * Running things in an Astlide project: its `astlide` CLI, `astro build`,
 * and where a deck's built print view is.
 *
 * @module
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface RunResult {
	code: number;
	stdout: string;
	stderr: string;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping terminal escapes is the point
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/** Run a command to completion, collecting its output (never throws on a non-zero exit). */
export function run(command: string, args: string[], cwd: string): Promise<RunResult> {
	return new Promise((done, fail) => {
		const child = spawn(command, args, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => {
			stdout += d;
		});
		child.stderr.on("data", (d) => {
			stderr += d;
		});
		child.on("error", fail);
		child.on("close", (code) =>
			done({
				code: code ?? 1,
				stdout: stdout.replace(ANSI, ""),
				stderr: stderr.replace(ANSI, ""),
			}),
		);
	});
}

/** The project root, checked: it must hold `src/content/decks`. */
export function projectRoot(dir: string): string {
	const root = resolve(dir);
	if (!existsSync(join(root, "src", "content", "decks")))
		throw new Error(`${root} is not an Astlide project (no src/content/decks)`);
	return root;
}

/** The deck's folder, checked. */
export function deckDir(root: string, deck: string): string {
	if (!/^[\w.-]+$/.test(deck) || deck.startsWith(".")) throw new Error(`bad deck name "${deck}"`);
	const dir = join(root, "src", "content", "decks", deck);
	if (!existsSync(dir))
		throw new Error(`no deck "${deck}" in ${join(root, "src", "content", "decks")}`);
	return dir;
}

/** Bun runs the `astlide` CLI (a TypeScript entry with a `bun` shebang). */
const bun = () => (process.versions.bun ? process.execPath : "bun");

/** The `astlide` CLI entry: the project's own @astlide/core, else this one's. */
export function astlideCli(root: string): string {
	try {
		const index = createRequire(join(root, "package.json")).resolve("@astlide/core");
		return join(dirname(index), "cli", "astlide.ts");
	} catch {
		return fileURLToPath(new URL("../cli/astlide.ts", import.meta.url));
	}
}

/** Run `astlide <args>` in the project. */
export function runAstlide(root: string, args: string[]): Promise<RunResult> {
	return run(bun(), [astlideCli(root), ...args, "--cwd", root], root);
}

/** Run `astro build` in the project (with Node, as `astlide export` does). */
export async function buildSite(root: string): Promise<void> {
	const astro = join(
		dirname(createRequire(join(root, "package.json")).resolve("astro/package.json")),
		"bin",
		"astro.mjs",
	);
	const r = await run("node", [astro, "build", "--root", root], root);
	if (r.code !== 0) {
		const log = `${r.stdout}\n${r.stderr}`.trim().split("\n").slice(-30).join("\n");
		throw new Error(`astro build failed:\n${log}`);
	}
}

/** The deck's built print view (all slides in one page). */
export function printView(root: string, deck: string): string {
	return join(root, "dist", deck, "all", "index.html");
}
