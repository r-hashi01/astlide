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
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, extname, join, relative, resolve, sep } from "node:path";
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

/** How to name the folders the MCP server may work in (part of its refusals). */
const HOW_TO_ALLOW =
	"Building or exporting runs the project's code, so name the folders it may work in: " +
	"`astlide mcp --root <dir>` (repeatable) or ASTLIDE_MCP_ROOTS=<dir>[" +
	delimiter +
	"<dir>…], MCP roots from the client, or ASTLIDE_MCP_ANY_PROJECT=1 to allow any folder.";

/** Shared folders: anyone on the machine can put a "project" there. */
const SHARED_FOLDERS = () => [
	tmpdir(),
	"/tmp",
	"/private/tmp",
	"/var/tmp",
	"/Users/Shared",
	process.env.PUBLIC ?? "C:\\Users\\Public",
];

/**
 * Whether `dir` is too broad to be an allowed folder by default: the
 * filesystem root, the home folder, a shared folder (temp folders,
 * `/Users/Shared`, `C:\Users\Public`), or a folder above one of them — what
 * MCP clients often start servers in.
 */
export function isBroadFolder(dir: string, home: string = homedir()): boolean {
	const real = realPath(dir);
	if (dirname(real) === real) return true;
	if (isWithin(home, real)) return true;
	return SHARED_FOLDERS().some((shared) => existsSync(shared) && isWithin(shared, real));
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

/** The `--template-store <location>` given to `astlide mcp`, if any. */
export function templateStoreArg(args: string[]): string | undefined {
	let location: string | undefined;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] as string;
		if (arg === "--template-store") location = args[++i] ?? "";
		else if (arg.startsWith("--template-store=")) location = arg.slice("--template-store=".length);
		else continue;
		if (!location || location.startsWith("-"))
			throw new Error("--template-store needs a location: a folder, s3://, gs:// or azure://");
	}
	return location;
}

/** Whether `root` is `folder` itself or a folder directly in it (symlinks resolved). */
function atOrJustBelow(root: string, folder: string): boolean {
	const rel = relative(realPath(folder), realPath(root));
	return rel === "" || (!rel.startsWith("..") && !rel.includes(sep) && !rel.includes("/"));
}

/**
 * The project root, checked ({@link projectRoot}): it must be one of
 * `allowed`, or a folder directly in one (symlinks resolved) — the MCP
 * server only builds or exports projects the user pointed it at, not any
 * repository somewhere below a broad folder. A deeper project needs its own
 * `--root`. Returns the resolved path that was checked, so the work happens
 * there even if a symlink on the way changes afterwards.
 */
export function projectRootWithin(dir: string, allowed: string[]): string {
	const root = realPath(projectRoot(dir));
	if (!allowed.length)
		throw new Error(`No folders are allowed for projects yet (${root}). ${HOW_TO_ALLOW}`);
	if (!allowed.some((a) => isWithin(root, a)))
		throw new Error(
			`${root} is outside the folders this server may work in (${allowed.join(", ")}). ${HOW_TO_ALLOW}`,
		);
	if (!allowed.some((a) => atOrJustBelow(root, a)))
		throw new Error(
			`${root} is more than one folder below the folders this server may work in (${allowed.join(", ")}): ` +
				`name the project itself (or its parent) with --root. ${HOW_TO_ALLOW}`,
		);
	return root;
}

/** Largest PowerPoint file the MCP server reads, in bytes. */
export const MAX_INPUT_FILE = 256 * 1024 * 1024;

/**
 * An input file the MCP server may read: a regular file (symlinks
 * resolved) with one of `extensions`, at most {@link MAX_INPUT_FILE} bytes,
 * inside one of `allowed` (any depth) — or anywhere when `allowed` is
 * `null` (`ASTLIDE_MCP_ANY_PROJECT=1`). Returns the resolved path.
 */
export function inputFileWithin(
	path: string,
	allowed: string[] | null,
	extensions: Set<string>,
): string {
	const real = realPath(path);
	const ext = (p: string) => extname(p).toLowerCase();
	const expected = [...extensions].join(" / ");
	if (!extensions.has(ext(path)) || !extensions.has(ext(real)))
		throw new Error(`${path}: expected a ${expected} file`);
	if (allowed) {
		if (!allowed.length)
			throw new Error(`No folders are allowed to read from yet (${real}). ${HOW_TO_ALLOW}`);
		if (!allowed.some((a) => isWithin(real, a)))
			throw new Error(
				`${real} is outside the folders this server may read (${allowed.join(", ")}). ${HOW_TO_ALLOW}`,
			);
	}
	const stat = statSync(real, { throwIfNoEntry: false });
	if (!stat?.isFile()) throw new Error(`${path}: not a file`);
	if (stat.size > MAX_INPUT_FILE)
		throw new Error(`${path}: larger than ${MAX_INPUT_FILE / 1024 / 1024} MB`);
	return real;
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

/**
 * Oldest project `@astlide/core` whose CLI the server runs: from here on
 * it checks deck names, refuses symlinked deck folders and takes the deck
 * after `--`. Older projects get this package's CLI.
 */
export const MIN_PROJECT_CLI = "2.8.0";

/** Whether version `a` (x.y.z…) is at least `b`. */
function atLeast(a: string, b: string): boolean {
	const pa = a.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
	const pb = b.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
	for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
	return true;
}

/**
 * The `astlide` CLI entry: the project's own @astlide/core (so exports
 * match the version the project builds with) when it is at least
 * {@link MIN_PROJECT_CLI}, else this package's.
 */
export function astlideCli(root: string): string {
	const bundled = fileURLToPath(new URL("../cli/astlide.ts", import.meta.url));
	try {
		const index = createRequire(join(root, "package.json")).resolve("@astlide/core");
		let dir = dirname(index);
		while (!existsSync(join(dir, "package.json")) && dirname(dir) !== dir) dir = dirname(dir);
		const { version } = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")) as {
			version?: string;
		};
		if (!version || !atLeast(version, MIN_PROJECT_CLI)) return bundled;
		return join(dirname(index), "cli", "astlide.ts");
	} catch {
		return bundled;
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
