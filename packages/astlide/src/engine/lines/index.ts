/**
 * Line layout: inline content into lines, in four stages — segment.ts
 * (white space and break opportunities), measure.ts (widths), fit.ts
 * (which words go on which line) and place.ts (where the lines and their
 * pieces go).
 */

import type { FontRegistry, InlineStyle } from "../text";
import { fitLines } from "./fit";
import type { InlineItem, LineBreakResult } from "./items";
import { measure } from "./measure";
import { placeLines } from "./place";
import { segment } from "./segment";

export type {
	AtomicInline,
	InlineItem,
	LineBreakResult,
	PlacedFragment,
	PlacedInlineBox,
} from "./items";

/**
 * Lay out inline items into lines of at most `maxWidth` px. `strut` is the
 * block container's own inline style (it sets the minimum line height).
 */
export function layoutLines(
	items: InlineItem[],
	maxWidth: number,
	strut: InlineStyle,
	textAlign: string,
	fonts: FontRegistry,
	/** `text-indent`: the first line starts this far in. */
	indent = 0,
): LineBreakResult {
	const words = segment(items);
	measure(words, fonts);
	return placeLines(fitLines(words, maxWidth, indent, fonts), maxWidth, strut, textAlign, indent);
}
