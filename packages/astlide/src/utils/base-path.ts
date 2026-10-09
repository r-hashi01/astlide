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

declare const __ASTLIDE_TRAILING_SLASH__: boolean | undefined;

/**
 * Whether page URLs end in `/`: Astro's `trailingSlash: "always"`, or the
 * default `build.format: "directory"` (pages are `<path>/index.html`, which
 * static hosts redirect to from the slash-less URL) unless `trailingSlash` is
 * `"never"`. Set by the integration.
 */
export const trailingSlash: boolean =
	typeof __ASTLIDE_TRAILING_SLASH__ !== "undefined" ? __ASTLIDE_TRAILING_SLASH__ : false;

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
 * URL of an Astlide page (`/my-deck/3`, `/my-deck/all`): {@link withBase} plus
 * the project's trailing-slash convention, so static hosts don't answer with a
 * redirect. A query string or hash is kept after the slash.
 *
 * @param path - Root-relative page path, optionally with `?query` / `#hash`.
 * @param slash - Override {@link trailingSlash} (for tests).
 *
 * @example
 * // base: "/astlide", build.format: "directory"
 * pageUrl("/my-deck/3?presenter"); // → "/astlide/my-deck/3/?presenter"
 */
export function pageUrl(path: string, slash: boolean = trailingSlash): string {
	const href = withBase(path);
	const cut = href.search(/[?#]/);
	const pathname = cut === -1 ? href : href.slice(0, cut);
	const rest = cut === -1 ? "" : href.slice(cut);
	return slash && !pathname.endsWith("/") ? `${pathname}/${rest}` : pathname + rest;
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
