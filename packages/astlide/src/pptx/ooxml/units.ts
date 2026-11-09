/**
 * Units and escaping for OOXML: EMU, hundredths of a point, XML text. Used
 * by both the import and the export.
 *
 * @module
 */

/** English Metric Units per inch, the unit of OOXML positions and sizes. */
export const EMU_PER_INCH = 914400;
/** EMU per point (1/72 inch): line widths, indents, font metrics. */
export const EMU_PER_POINT = 12700;

/** @internal */
export function emu(inches: number): number {
	return Math.round(inches * EMU_PER_INCH);
}

/** @internal */
export function hpt(pt: number): number {
	return Math.round(pt * 100);
}

/** @internal Text escaped for XML; characters XML can't hold (most control characters) are dropped. */
export function esc(str: string): string {
	return (
		str
			// biome-ignore lint/suspicious/noControlCharactersInRegex: these are the characters being removed
			.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&apos;")
	);
}
