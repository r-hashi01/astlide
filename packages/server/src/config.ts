/**
 * Server settings: from environment variables, with defaults.
 *
 * @module
 */

import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";

export interface ServerOptions {
	/** Where per-request projects are created (and deleted). */
	workDir: string;
	/** The `node_modules` holding `astro` and `@astlide/core`, linked into each project. */
	nodeModules: string;
	/** The `astlide` CLI entry (`@astlide/core`'s bin). */
	cli: string;
	/** Runtime that runs the CLI (Bun). */
	bun: string;
	/** Largest request body, in bytes. */
	maxBodyBytes: number;
	/** Most slides per render. */
	maxSlides: number;
	/** A render taking longer is stopped (ms). */
	renderTimeoutMs: number;
	/** Renders running at once. */
	concurrency: number;
	/** Renders waiting; more are refused with 503. */
	maxQueued: number;
	/** Largest rendered file (PPTX, PDF or PNG zip), in bytes; a bigger one is a 422. */
	maxOutputBytes: number;
	/** Chromium's sandbox for PDF / PNG: on unless `ASTLIDE_CHROMIUM_SANDBOX=0` (it needs user namespaces). */
	chromiumSandbox: boolean;
	/** When set, requests need `Authorization: Bearer <key>` (or `X-API-Key: <key>`). */
	apiKey?: string;
	/** The server's public URL, for the OpenAPI spec's `servers` (default: from the request). */
	publicUrl?: string;
	/**
	 * Let rendered slides load from the server's own network (loopback,
	 * private ranges, cloud metadata). Off by default: a deck is someone
	 * else's HTML, and the render runs inside your network.
	 */
	allowPrivateNetwork: boolean;
	/** Serve without an API key on a non-loopback host (`ASTLIDE_ALLOW_UNAUTHENTICATED=1`). */
	allowUnauthenticated: boolean;
}

const positive = (value: string | undefined, fallback: number): number => {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** The `node_modules` directory this server resolves `astro` from. */
function findNodeModules(): string {
	const require = createRequire(import.meta.url);
	const astro = require.resolve("astro/package.json");
	const nodeModules = dirname(dirname(astro));
	if (!existsSync(join(nodeModules, "@astlide", "core", "package.json")))
		throw new Error(`@astlide/core is not installed next to astro (in ${nodeModules})`);
	return nodeModules;
}

/** The longest directory both paths are in ("" when only the filesystem root). */
function commonDir(a: string, b: string): string {
	const pa = a.split(sep);
	const pb = b.split(sep);
	const out: string[] = [];
	for (let i = 0; i < Math.min(pa.length, pb.length) && pa[i] === pb[i]; i++)
		out.push(pa[i] as string);
	return out.join(sep);
}

export function resolveOptions(
	env: Record<string, string | undefined> = process.env,
): ServerOptions {
	const nodeModules = findNodeModules();
	const core = join(nodeModules, "@astlide", "core");
	const pkg = JSON.parse(readFileSync(join(core, "package.json"), "utf-8")) as {
		bin: Record<string, string>;
	};
	const cli = join(realpathSync(core), pkg.bin.astlide as string);
	const workDir = env.ASTLIDE_WORK_DIR ?? join(dirname(nodeModules), ".astlide-work");
	mkdirSync(workDir, { recursive: true });
	// Astro resolves files outside the project root as root-relative unless the
	// two share a directory, so projects must live near the installed packages.
	if (commonDir(realpathSync(workDir), realpathSync(core)) === "")
		throw new Error(
			`ASTLIDE_WORK_DIR (${workDir}) must share a parent directory with ${realpathSync(core)}`,
		);
	return {
		workDir: realpathSync(workDir),
		nodeModules,
		cli,
		bun: env.ASTLIDE_BUN ?? (process.versions.bun ? process.execPath : "bun"),
		maxBodyBytes: positive(env.MAX_BODY_MB, 50) * 1024 * 1024,
		maxSlides: positive(env.MAX_SLIDES, 200),
		renderTimeoutMs: positive(env.RENDER_TIMEOUT_MS, 180_000),
		concurrency: positive(env.CONCURRENCY, 2),
		maxQueued: positive(env.MAX_QUEUE, 16),
		maxOutputBytes: positive(env.MAX_OUTPUT_MB, 200) * 1024 * 1024,
		chromiumSandbox: env.ASTLIDE_CHROMIUM_SANDBOX !== "0",
		apiKey: env.ASTLIDE_API_KEY || undefined,
		publicUrl: (env.PUBLIC_URL && trimTrailingSlashes(env.PUBLIC_URL)) || undefined,
		allowPrivateNetwork: env.ASTLIDE_ALLOW_PRIVATE_NETWORK === "1",
		allowUnauthenticated: env.ASTLIDE_ALLOW_UNAUTHENTICATED === "1",
	};
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Why the server must not start listening on `host` with these options, or
 * undefined when it may: without an API key it only listens on loopback,
 * unless `ASTLIDE_ALLOW_UNAUTHENTICATED=1` says the network in front of it
 * does the access control.
 */
export function exposureError(
	host: string,
	options: Pick<ServerOptions, "apiKey" | "allowUnauthenticated">,
): string | undefined {
	if (options.apiKey || options.allowUnauthenticated || LOOPBACK.has(host.toLowerCase()))
		return undefined;
	return (
		`refusing to listen on ${host} without an API key: set ASTLIDE_API_KEY, ` +
		"listen on HOST=127.0.0.1, or set ASTLIDE_ALLOW_UNAUTHENTICATED=1 when something else controls access"
	);
}

/** `value` without trailing slashes (a loop: a regex like /\/+$/ backtracks on long runs of slashes). */
export function trimTrailingSlashes(value: string): string {
	let end = value.length;
	while (end > 0 && value.charCodeAt(end - 1) === 47) end--;
	return value.slice(0, end);
}
