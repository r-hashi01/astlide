/**
 * Content-Security-Policy helpers.
 *
 * @module
 */

/**
 * What the dev server's client needs on top of the page's policy: Vite polls for
 * a restarted server from a `blob:` worker while the tab is hidden. Without it,
 * `script-src` applies, the worker is blocked, and background tabs (e.g. the
 * presenter window) never reconnect after a restart.
 */
const DEV_WORKER_SRC = "worker-src 'self' blob:";

/**
 * Add `worker-src 'self' blob:` to a policy during `astro dev`, unless it sets
 * `worker-src` itself. Production output is returned unchanged.
 *
 * @param policy - The CSP to emit.
 * @param dev - Whether this is the dev server (`import.meta.env.DEV`).
 *
 * @example
 * withDevDirectives("default-src 'self'", true);
 * // → "default-src 'self'; worker-src 'self' blob:"
 */
export function withDevDirectives(policy: string, dev: boolean): string {
	if (!dev || /(?:^|;)\s*worker-src\s/i.test(policy)) return policy;
	const trimmed = policy.trim().replace(/;\s*$/, "");
	return trimmed ? `${trimmed}; ${DEV_WORKER_SRC}` : DEV_WORKER_SRC;
}
