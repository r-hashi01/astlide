/**
 * Line breaking, stage 4: lines placed in the block — each line's height
 * from baseline alignment with half-leading (CSS 2 §10.8), text-align, and
 * the fragments, inline box pieces and atomic inlines on it.
 */

import { type InlineStyle, verticalMetrics } from "../text";
import type { Line, LineBreakResult, PlacedFragment, PlacedInlineBox } from "./items";

/** A line's width without the white space hanging at its end. */
function contentWidth(l: Line): number {
	let w = l.width;
	for (let i = l.words.length - 1; i >= 0 && l.words[i]?.space; i--) w -= l.words[i]?.width ?? 0;
	return w;
}

export function placeLines(
	lines: Line[],
	maxWidth: number,
	strut: InlineStyle,
	textAlign: string,
	indent: number,
): LineBreakResult {
	const fragments: PlacedFragment[] = [];
	const inlineBoxes: PlacedInlineBox[] = [];
	const atomics: LineBreakResult["atomics"] = [];
	const baselines: number[] = [];
	/** Inline boxes still open at the end of the previous line (continue on the next). */
	let carried: number[] = [];
	let y = 0;
	let maxW = 0;
	for (const [li, l] of lines.entries()) {
		const inlineStyles = [strut, ...l.words.flatMap((w) => (w.style ? [w.style] : []))];
		let above = 0;
		let below = 0;
		for (const s of inlineStyles) {
			const m = verticalMetrics(s.face, s.size);
			// Chromium floors the ascent-side half-leading (the rest goes below).
			const leading = s.lineHeight - (m.ascent + m.descent);
			const half = Math.floor(leading / 2);
			above = Math.max(above, m.ascent + half);
			below = Math.max(below, m.descent + leading - half);
		}
		// vertical-align: baseline — the box's baseline on the line's.
		for (const w of l.words) {
			if (!w.atomic) continue;
			above = Math.max(above, w.atomic.baseline);
			below = Math.max(below, w.atomic.height - w.atomic.baseline);
		}
		const lineHeight = above + below;
		const baseline = y + above;
		baselines.push(baseline);
		const lw = contentWidth(l);
		const lead = li === 0 ? indent : 0;
		maxW = Math.max(maxW, lw + lead);
		const offset =
			lead +
			(textAlign === "center"
				? (maxWidth - lead - lw) / 2
				: textAlign === "right" || textAlign === "end"
					? maxWidth - lead - lw
					: 0);
		// Merge consecutive words of the same text node into fragments.
		let x = offset;
		let frag: PlacedFragment | null = null;
		const trailing = l.words.length - [...l.words].reverse().findIndex((w) => !w.space);
		const openAt = new Map<number, number>(carried.map((id) => [id, offset]));
		l.words.forEach((w, i) => {
			const hanging = i >= trailing;
			if (w.edge) {
				if (w.edge.kind === "open") openAt.set(w.edge.id, x);
				else {
					const start = openAt.get(w.edge.id) ?? offset;
					openAt.delete(w.edge.id);
					inlineBoxes.push({ id: w.edge.id, x: start, w: x - start, baseline });
				}
				frag = null;
				return;
			}
			if (w.atomic) atomics.push({ item: w.atomic, x, y: baseline - w.atomic.baseline });
			if (!w.style || w.nodeIndex < 0) {
				frag = null;
				x += w.width;
				return;
			}
			if (frag && frag.nodeIndex === w.nodeIndex) {
				if (!hanging) {
					frag.text += w.text;
					// Like a Range's box: up to the last non-space character.
					if (!w.space) frag.w = x + w.width - frag.x;
				}
			} else if (!w.space) {
				const m = verticalMetrics(w.style.face, w.style.size);
				frag = {
					nodeIndex: w.nodeIndex,
					text: w.text,
					x,
					y: baseline - m.ascent,
					w: w.width,
					h: m.ascent + m.descent,
					line: li,
					lineTop: y,
					lineHeight,
					style: w.style,
				};
				fragments.push(frag);
			}
			x += w.width;
		});
		// Boxes that continue onto the next line end at this line's content end.
		carried = [...openAt.keys()];
		for (const [id, start] of openAt)
			inlineBoxes.push({ id, x: start, w: offset + lw - start, baseline });
		y += lineHeight;
	}
	for (const f of fragments) f.text = f.text.trimEnd();
	return { width: maxW, height: y, fragments, inlineBoxes, atomics, baselines };
}
