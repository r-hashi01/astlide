/**
 * Render a project's deck in a child process (`render-worker.ts`, so a
 * render can be stopped on timeout): `renderDeck` from @astlide/core — PPTX
 * by the layout engine, PDF / PNG by Playwright's Chromium. No Astro build.
 *
 * @module
 */

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DECK } from "./project";
import { zip } from "./zip";

export type Format = "pptx" | "pdf" | "png";

export const FORMATS: readonly Format[] = ["pptx", "pdf", "png"];

export const CONTENT_TYPES: Record<Format, string> = {
	pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	pdf: "application/pdf",
	png: "application/zip",
};

/** The rendered file. */
export interface Rendered {
	data: Buffer;
	contentType: string;
	/** File extension (`pptx`, `pdf`, `zip`). */
	ext: string;
}

/** The deck didn't render (bad input, or a failing build): HTTP 422. */
export class RenderFailed extends Error {
	status = 422;
}

/** The render took too long: HTTP 504. */
export class RenderTimeout extends Error {
	status = 504;
}

const MAX_LOG = 64 * 1024;

/** The useful end of the CLI's output, without the server's paths. */
/** `line` with paths into an install's `node_modules` cut to `<install>/node_modules/…` (indexOf, no regex). */
function hideInstallPaths(line: string): string {
	return line
		.split(" ")
		.map((word) => {
			const at = word.indexOf("node_modules");
			if (at <= 0) return word;
			const start = word.search(/[/\\]/);
			return start >= 0 && start < at ? `${word.slice(0, start)}<install>/${word.slice(at)}` : word;
		})
		.join(" ");
}

function summarize(log: string, root: string): string {
	const lines = log
		.split(root)
		.join("<project>")
		.split("\n")
		.map(hideInstallPaths)
		.map((l) => l.trimEnd())
		.filter((l) => l && !/^\s*(Slide|Rendering) \d/.test(l));
	// Stack traces point into the server's install, not at the slides.
	const stack = lines.findIndex((l) => /^\s*Stack trace:/.test(l));
	return (stack >= 0 ? lines.slice(0, stack) : lines)
		.filter((l) => !/^\s+at /.test(l))
		.slice(-20)
		.join("\n");
}

/**
 * Why a render failed, for the client — and, when that would tell the client
 * about the server itself (Chromium's sandbox couldn't start: how the host
 * or container is set up), the detail for the server's log instead.
 */
export function renderFailure(log: string, root: string): { client: string; server?: string } {
	const summary = summarize(log, root);
	if (/couldn't start its sandbox/i.test(log))
		return {
			client: "render failed: Chromium couldn't start its sandbox — see the server log",
			server: `Chromium couldn't start its sandbox:\n${summary}`,
		};
	return { client: `render failed:\n${summary}` };
}

const WORKER = fileURLToPath(new URL("./render-worker.ts", import.meta.url));

export interface RenderOptions {
	bun: string;
	timeoutMs: number;
	/** Let the slides reach the server's own network (see `ServerOptions`). */
	allowPrivateNetwork?: boolean;
	/** Most slides rendered to PDF / PNG (a deck's script can't make it render more). */
	maxSlides?: number;
	/** Largest rendered file, in bytes. */
	maxOutputBytes?: number;
	/** Chromium's sandbox (default on; `false` turns it off). */
	chromiumSandbox?: boolean;
}

/** Export the project's deck; resolves with the rendered file. */
export async function renderProject(
	root: string,
	format: Format,
	options: RenderOptions,
): Promise<Rendered> {
	const out = join(root, "out");
	const args = [WORKER, root, format];
	await new Promise<void>((resolve, reject) => {
		// Its own process group: when it ends (or times out), Chromium goes too.
		const child = spawn(options.bun, args, {
			cwd: root,
			detached: process.platform !== "win32",
			stdio: ["ignore", "pipe", "pipe"],
			env: renderEnv(options),
		});
		preferForOom(child.pid);
		let log = "";
		const collect = (d: Buffer) => {
			log = (log + d.toString()).slice(-MAX_LOG);
		};
		child.stdout?.on("data", collect);
		child.stderr?.on("data", collect);
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			killGroup(child.pid);
			child.kill("SIGKILL");
		}, options.timeoutMs);
		child.on("error", (e) => {
			clearTimeout(timer);
			reject(e);
		});
		child.on("exit", (code) => {
			clearTimeout(timer);
			// Whatever the worker left running (Chromium, the print view's server) goes with it.
			killGroup(child.pid);
			if (timedOut)
				reject(
					new RenderTimeout(`render took longer than ${Math.round(options.timeoutMs / 1000)}s`),
				);
			else if (code === 0) resolve();
			else {
				const failure = renderFailure(log, root);
				if (failure.server) console.error(`astlide-server: ${failure.server}`);
				reject(new RenderFailed(failure.client));
			}
		});
	});

	const limit = options.maxOutputBytes ?? Number.POSITIVE_INFINITY;
	const tooLarge = () =>
		new RenderFailed(`the rendered file is over ${Math.round(limit / 1024 / 1024)} MB`);
	if (format === "png") {
		const dir = join(out, `${DECK}-slides`);
		const names = (await readdir(dir)).filter((n) => n.endsWith(".png")).sort();
		const sizes = await Promise.all(names.map(async (n) => (await stat(join(dir, n))).size));
		if (sizes.reduce((a, b) => a + b, 0) > limit) throw tooLarge();
		const files = await Promise.all(
			names.map(async (name) => ({ name, data: await readFile(join(dir, name)) })),
		);
		return { data: zip(files), contentType: CONTENT_TYPES.png, ext: "zip" };
	}
	const file = join(out, `${DECK}.${format}`);
	if ((await stat(file)).size > limit) throw tooLarge();
	return {
		data: await readFile(file),
		contentType: CONTENT_TYPES[format],
		ext: format,
	};
}

/** Kill a render's process group (the CLI and everything it started). */
/**
 * On Linux, make the render (and Chromium — children inherit it) the
 * first thing the kernel kills when memory runs out, before the server.
 * Best effort: without /proc or the right, nothing changes.
 */
function preferForOom(pid: number | undefined): void {
	if (!pid || process.platform !== "linux") return;
	try {
		writeFileSync(`/proc/${pid}/oom_score_adj`, "800");
	} catch {
		// Not allowed here.
	}
}

function killGroup(pid: number | undefined): void {
	if (!pid || process.platform === "win32") return;
	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		// Already gone.
	}
}

/** Environment variables a render keeps from the server's (besides `LC_*`). */
const RENDER_ENV = new Set([
	"PATH",
	"HOME",
	"TMPDIR",
	"TMP",
	"TEMP",
	"LANG",
	"LANGUAGE",
	"TZ",
	"PLAYWRIGHT_BROWSERS_PATH",
	"BUN_INSTALL",
	// Windows
	"SYSTEMROOT",
	"WINDIR",
	"COMSPEC",
	"PATHEXT",
	"USERPROFILE",
	"APPDATA",
	"LOCALAPPDATA",
]);

/**
 * The render's environment: only the parts of the server's it needs (an
 * allowlist — no secrets, cloud credentials or proxy settings), with exports
 * kept off the internal network and the sandbox setting stated.
 */
export function renderEnv(
	options: Pick<RenderOptions, "allowPrivateNetwork" | "maxSlides" | "chromiumSandbox">,
	env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	// Only what a build and Chromium need — not the server's own secrets,
	// cloud credentials or proxy settings.
	const out: NodeJS.ProcessEnv = {};
	for (const [key, value] of Object.entries(env))
		if (value !== undefined && (RENDER_ENV.has(key.toUpperCase()) || /^LC_/i.test(key)))
			out[key] = value;
	Object.assign(out, { ASTRO_TELEMETRY_DISABLED: "1", FORCE_COLOR: "0", NO_COLOR: "1" });
	if (options.maxSlides) out.ASTLIDE_MAX_SLIDES = String(options.maxSlides);
	out.ASTLIDE_CHROMIUM_SANDBOX = options.chromiumSandbox === false ? "0" : "1";
	if (options.allowPrivateNetwork) delete out.ASTLIDE_PUBLIC_NETWORK_ONLY;
	else out.ASTLIDE_PUBLIC_NETWORK_ONLY = "1";
	return out;
}
