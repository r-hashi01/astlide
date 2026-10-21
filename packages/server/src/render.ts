/**
 * Render a project's deck with the `astlide export` CLI (in a child process,
 * so a render can be stopped on timeout): PPTX by @astlide/engine, PDF / PNG
 * by Playwright's Chromium.
 *
 * @module
 */

import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
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
function summarize(log: string, root: string): string {
	const lines = log
		.split(root)
		.join("<project>")
		.split("\n")
		.map((l) => l.trimEnd())
		.filter((l) => l && !/^\s*(Slide|Rendering) \d/.test(l));
	// Stack traces point into the server's install, not at the slides.
	const stack = lines.findIndex((l) => /^\s*Stack trace:/.test(l));
	return (stack >= 0 ? lines.slice(0, stack) : lines)
		.filter((l) => !/^\s+at /.test(l))
		.slice(-20)
		.join("\n");
}

export interface RenderOptions {
	cli: string;
	bun: string;
	timeoutMs: number;
	/** Let the slides reach the server's own network (see `ServerOptions`). */
	allowPrivateNetwork?: boolean;
}

/** Run `astlide export` on the project; resolves with the rendered file. */
export async function renderProject(
	root: string,
	format: Format,
	options: RenderOptions,
): Promise<Rendered> {
	const out = join(root, "out");
	const args = [options.cli, "export", DECK, `--${format}`, "--cwd", root, "--out-dir", out];
	await new Promise<void>((resolve, reject) => {
		// Its own process group: on timeout, Astro / Chromium children go too.
		const child = spawn(options.bun, args, {
			cwd: root,
			detached: process.platform !== "win32",
			stdio: ["ignore", "pipe", "pipe"],
			env: renderEnv(options),
		});
		let log = "";
		const collect = (d: Buffer) => {
			log = (log + d.toString()).slice(-MAX_LOG);
		};
		child.stdout?.on("data", collect);
		child.stderr?.on("data", collect);
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			try {
				if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
				else child.kill("SIGKILL");
			} catch {
				// Already gone.
			}
		}, options.timeoutMs);
		child.on("error", (e) => {
			clearTimeout(timer);
			reject(e);
		});
		child.on("exit", (code) => {
			clearTimeout(timer);
			if (timedOut)
				reject(
					new RenderTimeout(`render took longer than ${Math.round(options.timeoutMs / 1000)}s`),
				);
			else if (code === 0) resolve();
			else reject(new RenderFailed(`render failed:\n${summarize(log, root)}`));
		});
	});

	if (format === "png") {
		const dir = join(out, `${DECK}-slides`);
		const names = (await readdir(dir)).filter((n) => n.endsWith(".png")).sort();
		const files = await Promise.all(
			names.map(async (name) => ({ name, data: await readFile(join(dir, name)) })),
		);
		return { data: zip(files), contentType: CONTENT_TYPES.png, ext: "zip" };
	}
	return {
		data: await readFile(join(out, `${DECK}.${format}`)),
		contentType: CONTENT_TYPES[format],
		ext: format,
	};
}

/** The render's environment: the server's, less its secrets, with exports kept off the internal network. */
export function renderEnv(
	options: Pick<RenderOptions, "allowPrivateNetwork">,
	env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	const out: NodeJS.ProcessEnv = {
		...env,
		ASTRO_TELEMETRY_DISABLED: "1",
		FORCE_COLOR: "0",
		NO_COLOR: "1",
	};
	delete out.ASTLIDE_API_KEY;
	if (options.allowPrivateNetwork) delete out.ASTLIDE_PUBLIC_NETWORK_ONLY;
	else out.ASTLIDE_PUBLIC_NETWORK_ONLY = "1";
	return out;
}
