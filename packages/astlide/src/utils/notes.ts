/**
 * Whether speaker notes go into pages (the integration's `notes` option).
 *
 * @module
 */

declare const __ASTLIDE_NOTES__: boolean;

/**
 * Whether pages carry speaker notes: in `astro dev`, with `notes: "public"`,
 * and in the build `astlide export` makes; not in other builds (the default
 * `notes: "dev"`). True outside Astro (no define), e.g. in tests.
 */
export const notesIncluded: boolean =
	typeof __ASTLIDE_NOTES__ !== "undefined" ? __ASTLIDE_NOTES__ : true;
