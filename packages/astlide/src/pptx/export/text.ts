/**
 * Text boxes: a block's lines as paragraphs at their exact line height, runs
 * with their font, colour and decorations, inline backgrounds as highlights.
 *
 * @module
 */

import type { Scene, SceneItem } from "@astlide/core/engine";
import { hex, type TextItem } from "./common";
import { fontFor } from "./fonts";
import type { TextBoxSpec, TextRun, TextRunOptions } from "./ooxml/spec";

export function runOptions(item: TextItem, k: number): TextRunOptions {
	const f = fontFor(item.font.family, item.font.weight);
	return {
		fontSize: item.font.size * k * 72,
		color: hex(item.color),
		fontFace: f.face,
		bold: f.bold,
		italic: item.font.italic,
		letterSpacing: item.letterSpacing ? item.letterSpacing * k * 72 : undefined,
		highlight: highlightOf.get(item),
		underline: item.underline,
		strike: item.strike,
	};
}

type Rgb = [number, number, number];
const rgb = (h: string): Rgb => [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Rgb;
const toHex = (c: Rgb) =>
	c
		.map((v) => Math.round(v).toString(16).padStart(2, "0"))
		.join("")
		.toUpperCase();

/** Highlight color of text inside an inline background (inline code …). */
const highlightOf = new WeakMap<TextItem, string>();

/**
 * Inline backgrounds (inline code chips …) become the highlight of the text
 * they hold, so they move with it — PowerPoint flows the text with its own
 * metrics, and a separate shape would drift. Returns the rects replaced.
 * The highlight is opaque: translucent fills are composited over what lies
 * beneath them.
 */
export function inlineHighlights(scene: Scene): Set<SceneItem> {
	const replaced = new Set<SceneItem>();
	const texts = scene.items.filter((t): t is TextItem => t.kind === "text");
	scene.items.forEach((r, index) => {
		if (r.kind !== "rect" || !r.inline || !r.fill || r.fill.alpha <= 0) return;
		const inside = texts.filter((t) => {
			const cx = t.x + t.w / 2;
			const cy = t.y + t.h / 2;
			return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
		});
		if (inside.length === 0) return;
		// What the chip is painted over: the slide, then every box below it.
		let under = rgb(scene.background.hex);
		const cx = r.x + r.w / 2;
		const cy = r.y + r.h / 2;
		for (const b of scene.items.slice(0, index)) {
			if (b.kind !== "rect" || b.inline || !b.fill) continue;
			if (cx < b.x || cx > b.x + b.w || cy < b.y || cy > b.y + b.h) continue;
			under = blend(rgb(b.fill.hex), b.fill.alpha, under);
		}
		const color = toHex(blend(rgb(r.fill.hex), r.fill.alpha, under));
		for (const t of inside) highlightOf.set(t, color);
		replaced.add(r);
	});
	return replaced;
}

function blend(top: Rgb, alpha: number, bottom: Rgb): Rgb {
	return top.map((v, i) => v * alpha + (bottom[i] ?? 0) * (1 - alpha)) as Rgb;
}

/** Placeholder text box of a block, filled by {@link fillBlock} once all its lines are in. */
export const boxOf = new WeakMap<TextItem[], TextBoxSpec>();
export function blockBox(group: TextItem[]): TextBoxSpec {
	const box: TextBoxSpec = { type: "textbox", runs: [], x: 0, y: 0, w: 0, h: 0 };
	boxOf.set(group, box);
	return box;
}

/**
 * One text box per block of text, one paragraph per line box at its exact
 * line height, so the text keeps the slide's line breaks and stays editable
 * as a whole. Gaps between runs (spaces trimmed by layout, code indentation)
 * become spaces again.
 */
export function fillBlock(box: TextBoxSpec, group: TextItem[], k: number): TextBoxSpec {
	const t = blockText(group, k);
	if (!t) return box;
	const { block, align, top, bottom, right } = t;
	// The last paragraph ends the text: no trailing empty paragraph.
	return {
		...box,
		runs: t.runs,
		x: block.x * k,
		y: top * k,
		// Centered / right text needs the block's width; left text gets slack
		// because PowerPoint's glyph widths differ slightly (lines never wrap).
		w: align === "left" ? Math.max(block.w, (right - block.x) * 1.05) * k + 0.05 : block.w * k,
		h: (bottom - top) * k,
		align,
		valign: "top",
		wrap: false,
		inset: 0,
	};
}

/** A block's text as paragraphs (one per line box), with the lines' extent. */
export function blockText(group: TextItem[], k: number) {
	const block = group[0]?.block;
	if (!block) return null;
	const byLine = new Map<number, TextItem[]>();
	for (const it of group) {
		const line = byLine.get(it.line ?? 0) ?? [];
		line.push(it);
		byLine.set(it.line ?? 0, line);
	}
	const indices = [...byLine.keys()].sort((a, b) => a - b);
	const align = /center/.test(block.align)
		? "center"
		: /right|end/.test(block.align)
			? "right"
			: "left";
	const runs: TextRun[] = [];
	let top = 0;
	let bottom = 0;
	let right = block.x;
	let prev: { index: number; bottom: number } | null = null;
	for (const index of indices) {
		const items = (byLine.get(index) ?? []).sort((a, b) => a.x - b.x);
		const first = items[0];
		if (!first) continue;
		const lineTop = first.lineTop ?? first.y;
		const lineHeight = first.lineHeight ?? first.h;
		if (prev === null) top = lineTop;
		else if (index > prev.index + 1) {
			// Empty line boxes (blank lines in code) in between.
			const count = index - prev.index - 1;
			const each = (lineTop - prev.bottom) / count;
			for (let i = 0; i < count; i++)
				runs.push({ text: "", options: { breakLine: true, lineSpacing: each * k * 72 } });
		}
		// Left-aligned lines keep their indentation as spaces; centered / right ones are aligned by PowerPoint.
		let x = align === "left" ? block.x : first.x;
		const lineRuns: TextRun[] = [];
		for (const it of items) {
			const gap = it.x - x;
			const spaces = Math.round(gap / it.space) || (gap > it.space * 0.3 ? 1 : 0);
			if (spaces > 0) lineRuns.push({ text: " ".repeat(spaces), options: runOptions(it, k) });
			lineRuns.push({ text: it.text, options: runOptions(it, k) });
			x = it.x + it.w;
			right = Math.max(right, x);
		}
		const last = lineRuns[lineRuns.length - 1];
		if (last)
			last.options = { ...last.options, breakLine: true, align, lineSpacing: lineHeight * k * 72 };
		runs.push(...lineRuns);
		bottom = lineTop + lineHeight;
		prev = { index, bottom };
	}
	return { block, runs, align: align as "left" | "center" | "right", top, bottom, right };
}
