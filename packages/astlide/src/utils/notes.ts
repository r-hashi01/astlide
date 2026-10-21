/**
 * Whether speaker notes go into pages (the integration's `notes` option).
 *
 * @module
 */

declare const __ASTLIDE_NOTES__: boolean;

/**
 * True unless `notes: "dev"` is set and this is a build: pages then leave
 * speaker notes out.
 */
export const notesIncluded: boolean =
	typeof __ASTLIDE_NOTES__ !== "undefined" ? __ASTLIDE_NOTES__ : true;
