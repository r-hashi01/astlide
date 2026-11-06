/**
 * The pieces of line layout: inline items in (text, inline box edges,
 * atomic inlines), words while breaking, lines and fragments out.
 */

import type { InlineStyle } from "../text";

/** A piece of inline content: text from one text node, or spacing from an inline box edge. */
export type InlineItem =
	| { kind: "text"; text: string; style: InlineStyle; nodeIndex: number }
	| { kind: "space"; width: number }
	/** Start / end of an inline element's box (background, border, padding). */
	| { kind: "open" | "close"; id: number }
	/**
	 * An inline-level box laid out as a whole (inline-block, inline-flex …):
	 * its margin box size and baseline (from its top), set before line layout.
	 */
	| AtomicInline;

export interface AtomicInline {
	kind: "atomic";
	box: object;
	/** Whether lines may break around it (its parent's `white-space`). */
	wraps: boolean;
	width: number;
	height: number;
	baseline: number;
}

/** The part of an inline element's box on one line, relative to the block's content box. */
export interface PlacedInlineBox {
	id: number;
	x: number;
	w: number;
	/** Baseline of the line, from the top of the content box. */
	baseline: number;
}

export interface PlacedFragment {
	nodeIndex: number;
	text: string;
	x: number;
	/** Top of the glyph content area (ascent + descent), relative to the block's content box. */
	y: number;
	w: number;
	h: number;
	/** Index of the line box in the block. */
	line: number;
	/** Top and height of that line box (relative to the block's content box). */
	lineTop: number;
	lineHeight: number;
	style: InlineStyle;
}

export interface LineBreakResult {
	width: number;
	height: number;
	fragments: PlacedFragment[];
	inlineBoxes: PlacedInlineBox[];
	/** Where each atomic inline's margin box went (top left, relative to the content box). */
	atomics: { item: AtomicInline; x: number; y: number }[];
	/** Each line's baseline, from the top of the content box. */
	baselines: number[];
}

/** A unit of line breaking: a piece of text between break opportunities, white space, or an inline box edge. */
export interface Word {
	text: string;
	style: InlineStyle | null;
	nodeIndex: number;
	width: number;
	/** Whitespace after which a line may break (and which hangs at line end). */
	space: boolean;
	/** Preserved white space (pre*): kept at line starts. */
	pre?: boolean;
	/** A break opportunity right before this word (e.g. after a hyphen). */
	breakBefore?: boolean;
	forcedBreak?: boolean;
	/** Zero-width marker for an inline box edge. */
	edge?: { kind: "open" | "close"; id: number };
	atomic?: AtomicInline;
	/** Lines may break here (`white-space` isn't `nowrap` / `pre`). */
	wraps?: boolean;
	/** The character before it in its text node, to measure it in context (kerning). */
	before?: string;
}

/** A line being filled: its words and their total width. */
export interface Line {
	words: Word[];
	width: number;
}
