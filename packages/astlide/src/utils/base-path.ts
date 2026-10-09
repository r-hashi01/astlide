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

/**
 * Apply the `base` to a user-supplied asset URL when it is root-relative
 * (`/photo.jpg`), leaving everything else alone: relative paths, absolute and
 * protocol-relative URLs, `data:` URIs, and paths that already include the base.
 *
 * Used for `<ImageSide src>` and image `background`s, so decks keep working
 * when deployed under a sub-path.
 *
 * @example
 * // astro.config: base: "/astlide"
 * withBaseIfRootRelative("/photo.jpg");          // → "/astlide/photo.jpg"
 * withBaseIfRootRelative("https://x.dev/a.png"); // unchanged
 */
export function withBaseIfRootRelative(url: string): string {
	if (!url.startsWith("/") || url.startsWith("//")) return url;
	if (basePath && (url === basePath || url.startsWith(`${basePath}/`))) return url;
	return withBase(url);
}
