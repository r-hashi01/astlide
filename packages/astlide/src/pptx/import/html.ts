/**
 * Small helpers for the HTML the import writes.
 *
 * @module
 */

/** @internal */
export const esc = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const attrEsc = (s: string) => esc(s).replace(/"/g, "&quot;");

/** @internal */
export const r2 = (n: number) => Math.round(n * 100) / 100;

/** One shape per line, so imported slides read (and edit) shape by shape. */
export const line = (html: string) => (html ? `\n${html}` : "");
