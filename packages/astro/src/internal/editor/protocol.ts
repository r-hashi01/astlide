/**
 * What the slide editor in the page and its dev server endpoint agree on:
 * endpoints, the token header, and the HMR events. Browser-safe.
 *
 * @module
 */

export const EDITOR_ENDPOINT = "/__astlide/source";

/** Where the editor gets the dev server's token (see {@link refuseEditorRequest}). */
export const EDITOR_TOKEN_ENDPOINT = "/__astlide/editor-token";

/** Opening this with a one-time code (`?code=`) enables editing in that browser. */
export const EDITOR_UNLOCK_ENDPOINT = "/__astlide/editor";

/** Header carrying the dev server's editor token. */
export const EDITOR_TOKEN_HEADER = "x-astlide-editor-token";

/** HMR event sent instead of a full reload after an editor write. */
export const SOURCE_SAVED_EVENT = "astlide:source-saved";

/** HMR event sent instead of a full reload after a slide file is added or removed. */
export const DECK_CHANGED_EVENT = "astlide:deck-changed";
