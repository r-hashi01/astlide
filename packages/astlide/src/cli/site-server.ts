/**
 * Build the Astro site and serve it locally, so exporters can render pages
 * without the user starting a dev / preview server first.
 *
 * Astro runs in a child Node process (the project's own `astro` CLI): its
 * preview server doesn't run under Bun's HTTP implementation.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";

export interface SiteServer {
	/** Site URL including Astro's `base`, without a trailing slash. */
	url: string;
	stop(): Promise<void>;
}

/** Ask the OS for a free TCP port. */
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.unref();
		srv.on("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			const address = srv.address();
			const port = typeof address === "object" && address ? address.port : 0;
			srv.close(() => resolve(port));
		});
	});
}

/** The project's `astro` CLI entry. */
function astroBin(root: string): string {
	const require = createRequire(join(root, "package.json"));
	return join(dirname(require.resolve("astro/package.json")), "bin", "astro.mjs");
}

function runAstro(root: string, args: string[]): ChildProcess {
	return spawn("node", [astroBin(root), ...args, "--root", root], {
		cwd: root,
		stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env, FORCE_COLOR: "0" },
	});
}

/**
 * Run `astro build` (unless `build` is false, reusing `dist/`), then
 * `astro preview` on a free port. The URL — including Astro's `base` — is
 * read from the preview server's own output.
 */
export async function startSite(options: { root: string; build: boolean }): Promise<SiteServer> {
	if (options.build) {
		await new Promise<void>((resolve, reject) => {
			const child = runAstro(options.root, ["build"]);
			let log = "";
			child.stdout?.on("data", (d) => {
				log += d;
			});
			child.stderr?.on("data", (d) => {
				log += d;
			});
			child.on("error", reject);
			child.on("exit", (code) =>
				code === 0 ? resolve() : reject(new Error(`astro build failed (exit ${code}):\n${log}`)),
			);
		});
	}

	const port = await freePort();
	// --ignore-lock: a one-off foreground server. Without it Astro may start the
	// preview as a tracked background daemon (e.g. when run by a coding agent),
	// and it shouldn't take the project's preview lock either.
	const child = runAstro(options.root, [
		"preview",
		"--host",
		"127.0.0.1",
		"--port",
		String(port),
		"--ignore-lock",
	]);
	const url = await new Promise<string>((resolve, reject) => {
		let log = "";
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error(`astro preview did not start:\n${log}`));
		}, 60_000);
		const onData = (d: Buffer) => {
			log += d;
			// "Local    http://127.0.0.1:4322/my-repo/" — also inside JSON logs (quotes,
			// escaped newlines), which Astro prints when it detects an agent / CI.
			const match = log.match(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\/[^\s"\\]*/);
			if (match) {
				clearTimeout(timer);
				resolve(match[0].replace(/\/+$/, ""));
			}
		};
		child.stdout?.on("data", onData);
		child.stderr?.on("data", onData);
		child.on("exit", (code) => {
			clearTimeout(timer);
			reject(new Error(`astro preview exited (${code}):\n${log}`));
		});
	});

	return {
		url,
		stop: () =>
			new Promise<void>((resolve) => {
				if (child.exitCode !== null) return resolve();
				child.once("exit", () => resolve());
				child.kill();
			}),
	};
}
