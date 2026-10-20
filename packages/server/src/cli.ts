#!/usr/bin/env bun
/**
 * `astlide-server` — run the Astlide HTTP render service.
 *
 * Environment:
 *   PORT (8787), HOST (0.0.0.0), ASTLIDE_API_KEY, PUBLIC_URL,
 *   MAX_BODY_MB (50), MAX_SLIDES (200), RENDER_TIMEOUT_MS (180000),
 *   CONCURRENCY (2), MAX_QUEUE (16), ASTLIDE_WORK_DIR, ASTLIDE_BUN
 *
 * @module
 */

import { createHandler } from "./app";
import { resolveOptions } from "./config";
import { serve } from "./http";
import { removeStaleProjects } from "./project";

const options = resolveOptions();
await removeStaleProjects(options.workDir);
const server = await serve(createHandler(options), {
	port: Number(process.env.PORT ?? 8787),
	hostname: process.env.HOST ?? "0.0.0.0",
});
console.log(`astlide-server listening on ${server.url} (OpenAPI: ${server.url}/openapi.json)`);
if (!options.apiKey)
	console.log("  no ASTLIDE_API_KEY set: the API is open to anyone who can reach it");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, async () => {
		await server.close();
		await removeStaleProjects(options.workDir);
		process.exit(0);
	});
}
