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
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deckFolderName } from "../cli/import";
import { isWithin, realPath } from "../utils/real-path";

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

/** The environment for a child process: the variables in {@link CHILD_ENV} only, no secrets. */
export function childEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const out: NodeJS.ProcessEnv = {};
	for (const [key, value] of Object.entries(env))
		if (value !== undefined && CHILD_ENV.test(key) && !SECRET.test(key)) out[key] = value;
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

/** How to name the folders the MCP server may work in (part of its refusals). */
const HOW_TO_ALLOW =
	"Building or exporting runs the project's code, so name the folders it may work in: " +
	"`astlide mcp --root <dir>` (repeatable) or ASTLIDE_MCP_ROOTS=<dir>[" +
	delimiter +
	"<dir>…], MCP roots from the client, or ASTLIDE_MCP_ANY_PROJECT=1 to allow any folder.";

/** Shared temp folders: anyone on the machine can put a "project" there. */
const TEMP_FOLDERS = () => [tmpdir(), "/tmp", "/private/tmp", "/var/tmp"];

/**
 * Whether `dir` is too broad to be an allowed folder by default: the
 * filesystem root, the home folder, a shared temp folder, or a folder above
 * one of them — what MCP clients often start servers in.
 */
export function isBroadFolder(dir: string, home: string = homedir()): boolean {
	const real = realPath(dir);
	if (dirname(real) === real) return true;
	if (isWithin(home, real)) return true;
	return TEMP_FOLDERS().some((temp) => existsSync(temp) && isWithin(temp, real));
}

/**
 * Folders named for `astlide mcp`: every `--root <dir>` / `--root=<dir>` in
 * `args`, then the entries of `ASTLIDE_MCP_ROOTS` (separated like PATH),
 * resolved against the working directory.
 */
export function explicitRoots(
	args: string[],
	env: Record<string, string | undefined> = process.env,
): string[] {
	const roots: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] as string;
		let dir: string | undefined;
		if (arg === "--root") dir = args[++i] ?? "";
		else if (arg.startsWith("--root=")) dir = arg.slice("--root=".length);
		else continue;
		// An empty value would mean the working directory; a flag means the folder was left out.
		if (!dir || dir.startsWith("-")) throw new Error("--root needs a folder: --root <dir>");
		roots.push(dir);
	}
	for (const dir of (env.ASTLIDE_MCP_ROOTS ?? "").split(delimiter)) if (dir) roots.push(dir);
	return roots.map((dir) => resolve(dir));
}

/**
 * The project root, checked ({@link projectRoot}) and inside one of
 * `allowed` (symlinks resolved): the MCP server only builds or exports
 * projects under the folders it was given. Returns the resolved path that
 * was checked, so the work happens there even if a symlink on the way
 * changes afterwards.
 */
export function projectRootWithin(dir: string, allowed: string[]): string {
	const root = realPath(projectRoot(dir));
	if (!allowed.length)
		throw new Error(`No folders are allowed for projects yet (${root}). ${HOW_TO_ALLOW}`);
	if (!allowed.some((a) => isWithin(root, a)))
		throw new Error(
			`${root} is outside the folders this server may work in (${allowed.join(", ")}). ${HOW_TO_ALLOW}`,
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
