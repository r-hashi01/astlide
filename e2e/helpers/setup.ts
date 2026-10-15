/**
 * Vitest globalSetup: serves the built playground (`playground/dist`) on a
 * free port for the browser tests, and builds it first when it's missing
 * (or when E2E_BUILD=1). A static server — not `astro dev` — so the suite
 * never competes with a running dev server for its lock, and pages are the
 * same HTML that gets deployed.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve } from "node:path";
import type { TestProject } from "vitest/node";

const DIST = resolve(process.cwd(), "playground", "dist");

const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css",
	".js": "text/javascript",
	".mjs": "text/javascript",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".ttf": "font/ttf",
	".ico": "image/x-icon",
};

/** The file a URL path names in dist/ (directories → index.html), or null. */
function fileFor(urlPath: string): string | null {
	const path = normalize(join(DIST, decodeURIComponent(urlPath.split("?")[0] ?? "/")));
	if (!path.startsWith(DIST)) return null;
	for (const candidate of [path, join(path, "index.html"), `${path}.html`]) {
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	}
	return null;
}

export default async function setup(project: TestProject) {
	if (process.env.E2E_BUILD || !existsSync(join(DIST, "index.html"))) {
		execFileSync("bun", ["run", "build"], { stdio: "inherit" });
	}
	const server = createServer((req, res) => {
		const file = fileFor(req.url ?? "/");
		if (!file) {
			res.writeHead(404, { "content-type": "text/plain" }).end("not found");
			return;
		}
		res
			.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" })
			.end(readFileSync(file));
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const { port } = server.address() as AddressInfo;
	project.provide("baseUrl", `http://127.0.0.1:${port}`);
	return () => new Promise<void>((done) => server.close(() => done()));
}

declare module "vitest" {
	export interface ProvidedContext {
		baseUrl: string;
	}
}
