/**
 * Running things in an Astlide project: its `astlide` CLI, `astro build`,
 * and where a deck's built print view is.
 *
 * Both run the project's own code — its Astro config and integrations, MDX
 * slides, a `bunfig.toml` preload, the project's installed `@astlide/core` —
 * so the MCP server only does it in projects it is allowed to (see
 * {@link projectRootWithin}).
 *
 * @module
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deckFolderName } from "../cli/import";
import { isWithin } from "../utils/real-path";

export interface RunResult {
	code: number;
	stdout: string;
	stderr: string;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping terminal escapes is the point
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/** Environment variables a child build / export needs; everything else (tokens, keys …) is left out. */
const CHILD_ENV =
	/^(PATH|PATHEXT|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|TMPDIR|TMP|TEMP|LANG|LC_\w+|TZ|SHELL|SYSTEMROOT|SystemRoot|WINDIR|COMSPEC|NODE_OPTIONS|NODE_PATH|NODE_EXTRA_CA_CERTS|BUN_INSTALL|PLAYWRIGHT_BROWSERS_PATH|XDG_\w+|ASTLIDE_\w+|ASTRO_TELEMETRY_DISABLED|HTTPS?_PROXY|https?_proxy|NO_PROXY|no_proxy)$/;

/** Never passed on, even when {@link CHILD_ENV} matches (e.g. ASTLIDE_API_KEY). */
const SECRET = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i;

/** Set by the CLI itself for its own builds only (notes, export folder) — never inherited. */
const CLI_ONLY = new Set(["ASTLIDE_EXPORT_BUILD", "ASTLIDE_NOTES"]);

/** The environment for a child process: the variables in {@link CHILD_ENV} only, no secrets. */
export function childEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const out: NodeJS.ProcessEnv = {};
	for (const [key, value] of Object.entries(env))
		if (value !== undefined && CHILD_ENV.test(key) && !SECRET.test(key) && !CLI_ONLY.has(key))
			out[key] = value;
	return { ...out, FORCE_COLOR: "0", NO_COLOR: "1" };
}

/** Run a command to completion, collecting its output (never throws on a non-zero exit). */
export function run(command: string, args: string[], cwd: string): Promise<RunResult> {
	return new Promise((done, fail) => {
		const child = spawn(command, args, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env: childEnv(),
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

/**
 * The project root, checked ({@link projectRoot}) and inside one of
 * `allowed` (symlinks resolved): the MCP server only builds or exports
 * projects under the client's roots or its own working directory.
 */
export function projectRootWithin(dir: string, allowed: string[]): string {
	const root = projectRoot(dir);
	if (!allowed.some((a) => isWithin(root, a)))
		throw new Error(
			`${root} is outside the folders this server may work in (${allowed.join(", ")}). ` +
				"Building or exporting runs the project's code; start the server in the project " +
				"(or a parent folder), or set ASTLIDE_MCP_ANY_PROJECT=1 to allow any folder.",
		);
	return root;
}

/** The deck's folder, checked. */
export function deckDir(root: string, deck: string): string {
	deckFolderName(deck);
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

/** `astlide <command> --cwd <root> <rest>`: `--cwd` right after the command, before any `--`. */
export function astlideArgs(root: string, args: string[]): string[] {
	const [command = "", ...rest] = args;
	return [command, "--cwd", root, ...rest];
}

/** Run `astlide <args>` in the project. */
export function runAstlide(root: string, args: string[]): Promise<RunResult> {
	return run(bun(), [astlideCli(root), ...astlideArgs(root, args)], root);
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
