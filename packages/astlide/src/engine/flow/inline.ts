/**
 * Inline formatting (CSS 2 §9.4.2, §10.8): a run of text and atomic
 * inlines laid out into lines, its baselines, and `vertical-align`.
 */

import { edgesOf, marginsOf, type Sides } from "../box-model";
import type { ElementBox, TextRun } from "../box-tree";
import { type AtomicInline, type InlineItem, layoutLines } from "../lines";
import { clipsOverflow, value } from "../properties";
import { type InlineStyle, verticalMetrics } from "../text";

import type { Flow, Fragment, Placed, Sizes, Space } from "./index";

/** A run of inline content: its widest unbreakable piece, and its longest line unbroken. */
export function textSizes(flow: Flow, box: TextRun): Sizes {
	// An atomic inline counts with its own contribution.
	const sized = (key: "min" | "max") =>
		box.items.map((it) =>
			it.kind === "atomic" ? { ...it, width: flow.contribution(it.box as ElementBox)[key] } : it,
		);
	return {
		min: layoutLines(sized("min"), 0, box.strut, "left", flow.ctx.fonts, box.indent).width,
		max: layoutLines(
			sized("max"),
			Number.POSITIVE_INFINITY,
			box.strut,
			"left",
			flow.ctx.fonts,
			box.indent,
		).width,
	};
}

export function layoutText(flow: Flow, run: TextRun, space: Space): Fragment {
	const c = flow.contribution(run);
	const w =
		space.width ??
		(space.shrink ? Math.min(c.max, Math.max(c.min, space.available)) : space.available);
	// Atomic inlines: laid out first (shrink-to-fit in the line's width), then placed by the lines.
	const laid = new Map<AtomicInline, { f: Fragment; m: Sides }>();
	const items: InlineItem[] = run.items.map((it) => {
		if (it.kind !== "atomic") return it;
		const box = it.box as ElementBox;
		const f = flow.layout(box, { available: w, pctW: w, shrink: true });
		const m = marginsOf(flow.ctx, box.style, w);
		const height = f.h + m.top + m.bottom;
		const sized: AtomicInline = {
			...it,
			width: f.w + m.left + m.right,
			height,
			baseline: verticalAlign(flow, box, m.top + inlineBaseline(flow, box, f), height, run.strut),
		};
		laid.set(sized, { f, m });
		return sized;
	});
	const lines = layoutLines(items, w, run.strut, run.align, flow.ctx.fonts, run.indent);
	const kids: Placed[] = [];
	const pending: Placed[] = [];
	for (const a of lines.atomics) {
		const at = laid.get(a.item);
		if (!at) continue;
		const x = a.x + at.m.left;
		const y = a.y + at.m.top;
		kids.push({ f: at.f, x, y });
		for (const p of at.f.pending) pending.push({ ...p, x: p.x + x, y: p.y + y });
	}
	return { box: run, w, h: lines.height, kids, lines, mt: 0, mb: 0, pending };
}

/**
 * Where an atomic inline's baseline is, from its border-box top: an
 * inline-block's last line box (its bottom margin edge when it has none
 * or clips its overflow, CSS 2 §10.8.1); an inline flex / grid / table
 * box's first baseline, else its border-box bottom (css-align-3 §9).
 */
export function inlineBaseline(flow: Flow, box: ElementBox, f: Fragment): number {
	const last = box.kind === "block";
	const clips = clipsOverflow(box.style);
	const m = marginsOf(flow.ctx, box.style);
	const own = last && clips ? undefined : flow.baseline(f, last);
	return own ?? (last ? f.h + m.bottom : f.h);
}

/**
 * A table row's baseline: its first baseline-aligned cell's, else the
 * bottom of the lowest cell's content box (CSS 2 §17.5.3).
 */
export function rowBaseline(flow: Flow, row: Fragment): number | undefined {
	let low: number | undefined;
	for (const c of row.kids) {
		if (c.f.box.type !== "element") continue;
		const { style } = c.f.box;
		if (value(style, "vertical-align") === "baseline") {
			const b = flow.baseline(c.f, false);
			if (b !== undefined) return c.y + b;
		}
		const { padding, border } = edgesOf(flow.ctx, style, row.w);
		low = Math.max(low ?? 0, c.y + c.f.h - padding.bottom - border.bottom);
	}
	return low;
}

/**
 * Where the line's baseline crosses an atomic inline of `height` whose
 * own baseline is at `baseline` (from its margin-box top), by its
 * `vertical-align` against the parent's font (CSS 2 §10.8.1). `top` /
 * `bottom` align as `baseline`.
 */
export function verticalAlign(
	flow: Flow,
	box: ElementBox,
	baseline: number,
	height: number,
	parent: InlineStyle,
): number {
	const va = value(box.style, "vertical-align");
	const m = verticalMetrics(parent.face, parent.size);
	switch (va) {
		case "middle": {
			const f = parent.face.font;
			const xHeight = ((f.xHeight || f.unitsPerEm / 2) / f.unitsPerEm) * parent.size;
			return height / 2 + xHeight / 2;
		}
		case "text-top":
			return m.ascent;
		case "text-bottom":
			return height - m.descent;
		// Chromium's shifts: a fifth of the font size down, a third up (plus 1px).
		case "sub":
			return baseline - (parent.size / 5 + 1);
		case "super":
			return baseline + parent.size / 3 + 1;
	}
	// A length or a percentage of its line-height raises it.
	const own = flow.ctx.inlineStyle(box.style).lineHeight;
	const shift = flow.ctx.lengthIn(box.style, va, own);
	return Number.isNaN(shift) ? baseline : baseline + shift;
}
