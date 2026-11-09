/**
 * Table layout: automatic column widths (CSS 2 §17.5.2.2) and the
 * collapsing border model (§17.6.2).
 */

import { boxModel, edgesOf, lengthOf, outerWidth, type Sides } from "../box-model";
import type { ElementBox } from "../box-tree";
import { isAuto, keyword } from "../properties";

import type { Flow, Fragment, Placed, Sizes } from "./index";
import { sum } from "./util";

export function collapsed(_flow: Flow, box: ElementBox): boolean {
	return keyword(box.style, "border-collapse") === "collapse";
}

/**
 * A cell's min / max widths. A set width makes the column fixed: its
 * max is that width, but never below the content's min-content width
 * (CSS 2 §17.5.2.2). In a collapsed-border table a cell keeps half of
 * each border (`half`: what that saves).
 */
export function cellContribution(
	flow: Flow,
	box: ElementBox,
	half: number,
): { min: number; max: number; fixed: boolean } {
	const k = flow.contribution(box);
	const bm = boxModel(flow.ctx, box.style);
	if (bm.width === undefined) return { min: k.min - half, max: k.max - half, fixed: false };
	const content =
		outerWidth(bm, Math.max(bm.min.width, flow.contentSizes(box).min + bm.inset.x)) - half;
	// A border-box width already holds the halves.
	const borderBox = keyword(box.style, "box-sizing") === "border-box";
	const set = outerWidth(bm, borderBox ? bm.width : bm.width - half);
	return { min: content, max: Math.max(set, content), fixed: true };
}

/** Column min / max widths from the cells (span-1 cells first, then spanning cells spread). */
export function tableColumns(
	flow: Flow,
	box: ElementBox,
): { min: number[]; max: number[]; fixed: boolean[] } {
	const rows = box.rows ?? [];
	const placed = rows.map((r) => {
		let col = 0;
		return r.cells.map((c) => {
			const at = col;
			col += c.span;
			return { ...c, col: at };
		});
	});
	const n = Math.max(0, ...placed.map((r) => r.reduce((a, c) => Math.max(a, c.col + c.span), 0)));
	const min = Array<number>(n).fill(0);
	const max = Array<number>(n).fill(0);
	const fixed = Array<boolean>(n).fill(false);
	const cells = placed.flat();
	const collapse = collapsed(flow, box);
	const widths = (c: (typeof cells)[number]) => {
		const { border } = edgesOf(flow.ctx, c.box.style);
		return cellContribution(flow, c.box, collapse ? (border.left + border.right) / 2 : 0);
	};
	for (const c of cells.filter((c) => c.span === 1)) {
		const k = widths(c);
		min[c.col] = Math.max(min[c.col] ?? 0, k.min);
		max[c.col] = Math.max(max[c.col] ?? 0, k.max);
		if (k.fixed) fixed[c.col] = true;
	}
	// A <col> width is the column's width, if its cells fit (CSS 2 §17.5.2.2).
	for (const [i, cs] of (box.cols ?? []).entries()) {
		const w = i < n ? lengthOf(flow.ctx, cs, "width") : undefined;
		if (w === undefined) continue;
		max[i] = Math.max(min[i] ?? 0, w);
		fixed[i] = true;
	}
	for (const c of cells.filter((c) => c.span > 1)) {
		const k = widths(c);
		const cols = [...Array(c.span).keys()].map((i) => c.col + i).filter((i) => i < n);
		for (const [arr, need] of [
			[min, k.min],
			[max, k.max],
		] as const) {
			const have = cols.reduce((a, i) => a + (arr[i] ?? 0), 0);
			if (need > have) for (const i of cols) arr[i] = (arr[i] ?? 0) + (need - have) / cols.length;
		}
	}
	return { min, max, fixed };
}

/**
 * Column widths for a table `cw` wide (Chromium's auto layout): from
 * the min widths, fixed columns grow to their set widths first, then
 * the others toward their max widths, in proportion to how far each
 * can grow. Space beyond every max goes to the non-fixed columns (all
 * of them when every column is fixed), in proportion to their max.
 */
export function columnWidths(
	_flow: Flow,
	min: number[],
	max: number[],
	fixed: boolean[],
	cw: number,
): number[] {
	const grow = (from: number[], to: number[], which: (i: number) => boolean, room: number) => {
		const gap = from.map((f, i) => (which(i) ? Math.max(0, (to[i] ?? f) - f) : 0));
		const total = sum(gap);
		if (total <= 0 || room <= 0) return from;
		const t = Math.min(1, room / total);
		return from.map((f, i) => f + (gap[i] ?? 0) * t);
	};
	let widths = min;
	widths = grow(widths, max, (i) => fixed[i] === true, cw - sum(widths));
	widths = grow(widths, max, (i) => !fixed[i], cw - sum(widths));
	const extra = cw - sum(widths);
	if (extra > 0) {
		const loose = fixed.some((f) => !f) ? (i: number) => !fixed[i] : () => true;
		const weight = widths.map((w, i) => (loose(i) ? w : 0));
		const total = sum(weight);
		const count = widths.filter((_, i) => loose(i)).length;
		widths = widths.map(
			(w, i) =>
				w + (loose(i) ? (total > 0 ? ((weight[i] ?? 0) / total) * extra : extra / count) : 0),
		);
	}
	return widths;
}

/** A table's rows: columns between their min and max widths, each row as tall as its tallest cell. */
export function layoutTable(
	flow: Flow,
	box: ElementBox,
	cw: number,
): { kids: Placed[]; height: number; pending: Placed[]; columns: number[] } {
	const { min, max, fixed } = tableColumns(flow, box);
	const auto = isAuto(box.style, "width");
	// An auto-width table is no wider than its columns' max widths.
	let widths = columnWidths(flow, min, max, fixed, auto ? Math.min(cw, sum(max)) : cw);
	const collapse = collapsed(flow, box);
	const rows = box.rows ?? [];
	// The collapsing border model (CSS 2 §17.6.2): between two cells the
	// wider of their borders, each taking half; at the table's edges the
	// wider of the cell's and the table's, half inside the cell and half
	// in the table's edge.
	const own = new Map<ElementBox, Sides>();
	const grid: (ElementBox | undefined)[][] = rows.map((row) => {
		const line: (ElementBox | undefined)[] = [];
		for (const c of row.cells) {
			own.set(c.box, edgesOf(flow.ctx, c.box.style).border);
			for (let k = 0; k < c.span; k++) line.push(c.box);
		}
		return line;
	});
	const tableBorder = edgesOf(flow.ctx, box.style).border;
	const halvesOf = new Map<ElementBox, Sides>();
	const inset = { top: 0, right: 0, bottom: 0, left: 0 };
	if (collapse)
		for (const [r, line] of grid.entries())
			for (const [col, cell] of line.entries()) {
				if (!cell || line[col - 1] === cell) continue;
				const b = own.get(cell) as Sides;
				const span = line.filter((x) => x === cell).length;
				const above = grid[r - 1]?.[col];
				const below = grid[r + 1]?.[col];
				const left = line[col - 1];
				const right = line[col + span];
				const half = {
					top: Math.max(b.top, above ? (own.get(above)?.bottom ?? 0) : tableBorder.top) / 2,
					bottom: Math.max(b.bottom, below ? (own.get(below)?.top ?? 0) : tableBorder.bottom) / 2,
					left: Math.max(b.left, left ? (own.get(left)?.right ?? 0) : tableBorder.left) / 2,
					right: Math.max(b.right, right ? (own.get(right)?.left ?? 0) : tableBorder.right) / 2,
				};
				halvesOf.set(cell, half);
				if (!above) inset.top = Math.max(inset.top, half.top);
				if (!below) inset.bottom = Math.max(inset.bottom, half.bottom);
				if (!left) inset.left = Math.max(inset.left, half.left);
				if (!right) inset.right = Math.max(inset.right, half.right);
			}
	const halves = (cell: ElementBox): Sides | undefined => halvesOf.get(cell);
	if (collapse) {
		const inner = cw - inset.left - inset.right;
		const scale = sum(widths) > 0 && sum(widths) > inner ? inner / sum(widths) : 1;
		if (scale !== 1) widths = widths.map((w) => w * scale);
	}
	const colX = widths.map((_, i) => inset.left + sum(widths.slice(0, i)));
	const kids: Placed[] = [];
	const pending: Placed[] = [];
	let y = inset.top;
	for (const row of rows) {
		const rs = row.style;
		let col = 0;
		const cells = row.cells.map((c) => {
			const at = col;
			col += c.span;
			const w = sum(widths.slice(at, at + c.span));
			const borders = halves(c.box);
			return {
				c,
				at,
				w,
				borders,
				natural: flow.layout(c.box, {
					available: w,
					width: w,
					pctW: w,
					...(borders ? { borders } : {}),
				}),
			};
		});
		const specH = lengthOf(flow.ctx, rs, "height") ?? 0;
		const h = Math.max(specH, ...cells.map((x) => x.natural.h));
		const rowFrag: Fragment = {
			box: {
				type: "element",
				el: row.el,
				style: rs,
				eid: row.eid,
				kind: "block",
				bfcRoot: true,
				children: [],
			},
			w: sum(widths),
			h,
			kids: cells.map(({ c, at, w, borders }) => ({
				f: flow.layout(c.box, {
					available: w,
					width: w,
					height: h,
					pctW: w,
					pctH: h,
					...(borders ? { borders } : {}),
				}),
				x: colX[at] ?? 0,
				y: 0,
			})),
			mt: 0,
			mb: 0,
			pending: [],
		};
		kids.push({ f: rowFrag, x: inset.left, y });
		y += h;
	}
	// Rows are placed at the inset; their cells at the columns' x relative to the row.
	for (const k of kids) for (const cell of k.f.kids) cell.x -= inset.left;
	return { kids, height: y + inset.bottom, pending, columns: widths };
}

/** A table's content sizes: its columns' min / max widths added up. */
export function tableSizes(flow: Flow, box: ElementBox): Sizes {
	const { min, max } = tableColumns(flow, box);
	return { min: sum(min), max: sum(max) };
}
