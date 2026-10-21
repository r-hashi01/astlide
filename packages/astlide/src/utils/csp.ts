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

/** Directives every default policy ends with: no `<base>` / form / plugin tricks. */
const HARDENING = ["base-uri 'self'", "form-action 'self'", "object-src 'none'"];

/**
 * Default policy of deck pages (slides, `/[deck]/all`). `'unsafe-inline'` in
 * `script-src` is for `astro dev` only: in a build it is replaced by the
 * hashes of each page's inline scripts (see `utils/csp-hashes`). Styles keep
 * `'unsafe-inline'`: slides set `style` attributes throughout, which hashes
 * can't allow.
 */
export const DEFAULT_DECK_CSP = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"font-src 'self' https://fonts.gstatic.com data:",
	"img-src 'self' data: https: blob:",
	// `data:` and `blob:` allowed so the in-browser PDF exporter can fetch
	// its own rasterised page images while assembling the document.
	"connect-src 'self' data: blob:",
	"frame-src 'self' https://www.youtube-nocookie.com",
	...HARDENING,
].join("; ");

/** Default policy of the deck index page. */
export const DEFAULT_INDEX_CSP = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"font-src 'self' https://fonts.gstatic.com",
	"img-src 'self' data: https:",
	"connect-src 'self'",
	"frame-src 'self'",
	...HARDENING,
].join("; ");

/**
 * Whether a page's policy is one of the defaults, whose `script-src` gets the
 * page's inline-script hashes at build: true unless `csp` is `false` or a
 * policy string of your own.
 *
 * @param option - The `csp` integration option.
 */
export function cspHashable(option: boolean | string): boolean {
	return option !== false && !(typeof option === "string" && option !== "true");
}

/**
 * The CSP a page emits for the integration's `csp` option: `false` → none,
 * a string → that policy, otherwise `fallback`; plus the dev directives.
 *
 * @param option - The `csp` integration option.
 * @param fallback - The page's default policy ({@link DEFAULT_DECK_CSP} / {@link DEFAULT_INDEX_CSP}).
 * @param dev - Whether this is the dev server (`import.meta.env.DEV`).
 */
export function cspFor(option: boolean | string, fallback: string, dev: boolean): string | null {
	if (option === false) return null;
	return withDevDirectives(
		typeof option === "string" && option !== "true" ? option : fallback,
		dev,
	);
}

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
