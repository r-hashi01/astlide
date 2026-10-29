#!/usr/bin/env bun
/**
 * `astlide-server` — run the Astlide HTTP render service.
 *
 * Environment:
 *   PORT (8787), HOST (127.0.0.1; 0.0.0.0 in the Docker image), ASTLIDE_API_KEY, PUBLIC_URL,
 *   MAX_BODY_MB (50), MAX_SLIDES (200), RENDER_TIMEOUT_MS (180000),
 *   CONCURRENCY (2), MAX_QUEUE (16), ASTLIDE_WORK_DIR, ASTLIDE_BUN,
 *   ASTLIDE_ALLOW_UNAUTHENTICATED (0), ASTLIDE_ALLOW_PRIVATE_NETWORK (0),
 *   ASTLIDE_TEMPLATE_STORE (a folder, s3://, gs:// or azure://<bucket>/<prefix>;
 *   unset: templates aren't stored), with each cloud's usual credential variables
 *   (see https://astlide.dev/guides/template-storage/)
 *
 * Without ASTLIDE_API_KEY it refuses to listen on anything but loopback.
 *
 * @module
 */

import { createHandler } from "./app";
import { exposureError, resolveOptions } from "./config";
import { serve } from "./http";
import { removeLiveProjects, removeStaleProjects } from "./project";

const options = resolveOptions();
const hostname = process.env.HOST ?? "127.0.0.1";
const refused = exposureError(hostname, options);
if (refused) {
	console.error(`astlide-server: ${refused}`);
	process.exit(1);
}
// A template store that can't be reached is a setup mistake: say so now, not on the first upload.
if (options.templates) {
	try {
		await options.templates.list();
	} catch (e) {
		console.error(
			`astlide-server: can't use the template store (ASTLIDE_TEMPLATE_STORE): ${(e as Error).message}`,
		);
		process.exit(1);
	}
}
// A render never lives longer than its timeout: older projects are leftovers.
await removeStaleProjects(options.workDir, options.renderTimeoutMs * 2);
const server = await serve(createHandler(options), {
	port: Number(process.env.PORT ?? 8787),
	hostname,
});
console.log(`astlide-server listening on ${server.url} (OpenAPI: ${server.url}/openapi.json)`);
if (!options.apiKey)
	console.log("  no ASTLIDE_API_KEY set: the API is open to anyone who can reach it");
if (!options.chromiumSandbox)
	console.warn(
		"  ASTLIDE_CHROMIUM_SANDBOX=0: Chromium renders without its sandbox — only for slides you trust",
	);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, async () => {
		await server.close();
		await removeLiveProjects();
		process.exit(0);
	});
}
