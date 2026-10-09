/**
 * Support for Astro's `base` option (serving a site under a sub-path, e.g.
 * GitHub Pages project sites at `https://user.github.io/repo/`).
 *
 * Every internal link Astlide generates goes through {@link withBase}. Astro
 * prefixes routes and bundled assets with `base` automatically, but not
 * hand-built URLs like `/${deck}/${n}`.
 *
 * @module
 */

/**
 * The configured `base` without a trailing slash: `""` at the root, `"/repo"`
 * under a sub-path. Works whether `BASE_URL` ends in a slash or not (that
 * depends on Astro's `trailingSlash` setting).
 */
export const basePath: string = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");

/**
 * Prefix a root-relative path with the configured `base`.
 *
 * @example
 * // astro.config: base: "/astlide"
 * withBase("/my-deck/1"); // → "/astlide/my-deck/1"
 * withBase("/");          // → "/astlide/"
 */
export function withBase(path: string): string {
	return basePath + (path.startsWith("/") ? path : `/${path}`);
}
