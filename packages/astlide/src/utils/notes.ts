/**
 * Whether speaker notes go into pages (the integration's `notes` option).
 *
 * @module
 */

declare const __ASTLIDE_NOTES__: boolean;

/**
 * Whether pages carry speaker notes: in `astro dev`, with `notes: "public"`,
 * and in the build `astlide export` makes; not in other builds (the default
 * `notes: "dev"`). False when the integration didn't set it (no define), so
 * notes never ship by accident.
 */
export const notesIncluded: boolean =
	typeof __ASTLIDE_NOTES__ !== "undefined" ? __ASTLIDE_NOTES__ : false;
