/**
 * Grid layout (css-grid-1 §11): columns from the items' contributions,
 * then rows from the items laid out in their columns.
 */

import { aspectRatio, lengthOf, marginsOf } from "../box-model";
import type { ElementBox, TextRun } from "../box-tree";
import type { Computed } from "../cascade";
import {
	columnTracks,
	frSizes,
	type GridArea,
	linePlacement,
	parseTracks,
	placeGrid,
	sizeTracks,
	type Track,
} from "../grid";
import { isAuto, value } from "../properties";

import type { Flow, Placed, Sizes } from "./index";
import { sum } from "./util";

/** A grid's column tracks (template and implicit ones), percentages against `basis`. */
export function gridTracks(
	flow: Flow,
	style: Computed,
	basis: number | undefined,
	inner: number,
	gap: number,
	items: number,
) {
	return columnTracks(
		value(style, "grid-template-columns"),
		value(style, "grid-auto-flow"),
		value(style, "grid-auto-columns"),
		flow.lengthIn(style, basis),
		inner,
		gap,
		items,
	);
}

/**
 * A grid container's content (css-grid-1 §11): columns from the items'
 * contributions, rows from the items laid out in their columns. Rows
 * grow to their content (and may overflow the container); with a
 * definite height, auto rows stretch to fill it.
 */
export function layoutGrid(
	flow: Flow,
	box: ElementBox,
	cw: number,
	ch: number | undefined,
): { kids: Placed[]; height: number; pending: Placed[] } {
	const { style } = box;
	const pending: Placed[] = [];
	const items: (ElementBox | TextRun)[] = [];
	for (const child of box.children) {
		if (flow.absolute(child))
			pending.push({
				f: flow.layout(child, { available: cw, pctW: cw, pctH: ch, shrink: true }),
				x: 0,
				y: 0,
			});
		else items.push(child);
	}
	const colGap = lengthOf(flow.ctx, style, "column-gap", cw) ?? 0;
	const rowGap = lengthOf(flow.ctx, style, "row-gap", ch) ?? 0;
	const tracks = gridTracks(flow, style, cw, cw, colGap, items.length);
	const template = value(style, "grid-template-rows");
	const rowTracks =
		template === "none" ? [] : parseTracks(template, flow.lengthIn(style, ch), ch ?? 0, rowGap);
	const placed = placeGrid(
		items.map((k) => areaOf(k, tracks.length, rowTracks.length)),
		tracks.length,
	);
	const content = tracks.map(() => 0);
	for (const [i, p] of placed.entries()) {
		const item = items[i];
		if (item && p.span === 1)
			content[p.col] = Math.max(content[p.col] ?? 0, flow.contribution(item).max);
	}
	const widths = sizeTracks(tracks, cw, colGap, content);
	const nRows = Math.max(0, ...placed.map((p) => p.row + p.rowSpan));
	const colSpace = distribute(
		cw - sum(widths) - colGap * Math.max(0, widths.length - 1),
		widths.length,
		value(style, "justify-content"),
	);
	const colX = widths.map(
		(_, i) => colSpace.start + sum(widths.slice(0, i)) + (colGap + colSpace.between) * i,
	);
	const areaW = (p: { col: number; span: number }) =>
		sum(widths.slice(p.col, p.col + p.span)) + colGap * (p.span - 1);
	const rowH = Array<number>(nRows).fill(0);
	// Rows whose height is known before their items are sized: a fixed
	// track, or a lone row filling a definite height. Item percentages
	// (max-height: 100%) resolve against it.
	const knownH = (r: number): number | undefined => {
		const t = rowTracks[r];
		if (t?.kind === "fixed") return t.px;
		if (t === undefined && rowTracks.length === 0 && nRows === 1) return ch;
		return undefined;
	};
	/** Items spanning several rows, sized after the others (css-grid-1 §11.5). */
	const spanning: { p: GridArea; h: number }[] = [];
	for (const [i, p] of placed.entries()) {
		const item = items[i];
		if (!item) continue;
		const aw = areaW(p);
		// Percentage margins are of the grid area, as when the item is placed below.
		const m =
			item.type === "element"
				? marginsOf(flow.ctx, item.style, aw)
				: { top: 0, right: 0, bottom: 0, left: 0 };
		const r = p.row;
		const ah = p.rowSpan === 1 ? knownH(r) : undefined;
		const f = flow.layout(item, {
			available: aw,
			pctW: aw,
			...(ah !== undefined ? { pctH: ah } : {}),
			...(stretches(flow, item, "justify", style)
				? { width: Math.max(0, aw - m.left - m.right) }
				: { shrink: true }),
		});
		const h = f.h + m.top + m.bottom;
		if (p.rowSpan === 1) rowH[r] = Math.max(rowH[r] ?? 0, h);
		else spanning.push({ p, h });
	}
	// What a spanning item needs beyond its rows goes to them in equal parts.
	for (const { p, h } of spanning) {
		const have = sum(rowH.slice(p.row, p.row + p.rowSpan)) + rowGap * (p.rowSpan - 1);
		if (h > have)
			for (let r = p.row; r < p.row + p.rowSpan; r++)
				rowH[r] = (rowH[r] ?? 0) + (h - have) / p.rowSpan;
	}
	// Each row's track: the template's, then grid-auto-rows' pattern for implicit rows.
	const autoPattern = parseTracks(
		value(style, "grid-auto-rows") || "auto",
		flow.lengthIn(style, ch),
		ch ?? 0,
		rowGap,
	);
	const trackOf = (r: number): Track =>
		rowTracks[r] ??
		autoPattern[(r - rowTracks.length) % Math.max(1, autoPattern.length)] ?? {
			kind: "auto",
			min: 0,
		};
	const rowTrack = Array.from({ length: nRows }, (_, r) => trackOf(r));
	// Fixed rows as given, auto rows to their content (at least their minimum);
	// fr rows from their minimum: their content for a plain `1fr`.
	for (const [r, t] of rowTrack.entries()) {
		const content = rowH[r] ?? 0;
		rowH[r] =
			t.kind === "fixed"
				? t.px
				: t.kind === "auto"
					? Math.max(t.min, content)
					: t.minAuto
						? content
						: t.min;
	}
	const gaps = rowGap * Math.max(0, nRows - 1);
	if (rowTrack.some((t) => t.kind === "fr")) {
		if (ch !== undefined) {
			// A definite height: fr rows share what the other rows leave (§11.7).
			const sized = frSizes(rowTrack, rowH, ch - gaps);
			for (let r = 0; r < nRows; r++) rowH[r] = sized[r] ?? 0;
		} else {
			// Sized by content: each fr row as tall as the largest content per fr (§11.7.1).
			let unit = 0;
			for (const [r, t] of rowTrack.entries())
				if (t.kind === "fr" && t.fr > 0) unit = Math.max(unit, (rowH[r] ?? 0) / t.fr);
			for (const [r, t] of rowTrack.entries())
				if (t.kind === "fr") rowH[r] = Math.max(rowH[r] ?? 0, t.fr * unit);
		}
	} else if (ch !== undefined && /^(normal|stretch)$/.test(value(style, "align-content"))) {
		// A definite height: auto rows stretch to fill it (§11.8).
		const free = ch - sum(rowH) - gaps;
		const autos = rowTrack.filter((t) => t.kind === "auto").length;
		if (free > 0 && autos > 0)
			for (const [r, t] of rowTrack.entries())
				if (t.kind === "auto") rowH[r] = (rowH[r] ?? 0) + free / autos;
	}
	// Tracks aligned in the container (css-align-3 §5.3: align-content / justify-content).
	const rowSpace = distribute(
		ch === undefined ? 0 : ch - sum(rowH) - rowGap * Math.max(0, nRows - 1),
		nRows,
		value(style, "align-content"),
	);
	const rowY = rowH.map(
		(_, i) => rowSpace.start + sum(rowH.slice(0, i)) + (rowGap + rowSpace.between) * i,
	);
	const kids: Placed[] = [];
	for (const [i, p] of placed.entries()) {
		const item = items[i];
		if (!item) continue;
		const r = p.row;
		const aw = areaW(p);
		const last = r + p.rowSpan - 1;
		const ah = (rowY[last] ?? 0) + (rowH[last] ?? 0) - (rowY[r] ?? 0);
		const m =
			item.type === "element"
				? marginsOf(flow.ctx, item.style, aw)
				: { top: 0, right: 0, bottom: 0, left: 0 };
		const stretchW = stretches(flow, item, "justify", style);
		const stretchH = stretches(flow, item, "align", style);
		const f = flow.layout(item, {
			available: aw,
			pctW: aw,
			pctH: ah,
			...(stretchW ? { width: Math.max(0, aw - m.left - m.right) } : { shrink: true }),
			...(stretchH ? { height: Math.max(0, ah - m.top - m.bottom) } : {}),
		});
		let x = (colX[p.col] ?? 0) + m.left;
		let y = (rowY[r] ?? 0) + m.top;
		if (!stretchH && item.type === "element") {
			const free = ah - m.top - m.bottom - f.h;
			const a = autoMarginAlign(item, "top", "bottom") ?? selfAlign(flow, item, "align", style);
			if (a === "center") y += free / 2;
			else if (a === "end" || a === "flex-end") y += free;
		}
		if (!stretchW && item.type === "element") {
			const free = aw - m.left - m.right - f.w;
			const a = autoMarginAlign(item, "left", "right") ?? selfAlign(flow, item, "justify", style);
			if (a === "center") x += free / 2;
			else if (a === "end" || a === "flex-end") x += free;
		}
		kids.push({ f, x, y });
		for (const pp of f.pending) pending.push({ ...pp, x: pp.x + x, y: pp.y + y });
	}
	return { kids, height: sum(rowH) + rowGap * Math.max(0, nRows - 1), pending };
}

/** An item's place: start column and row (when given) and spans, from its grid-column / grid-row. */
function areaOf(
	item: ElementBox | TextRun,
	columns: number,
	rows: number,
): { span: number; rowSpan: number; col?: number; row?: number } {
	if (item.type !== "element") return { span: 1, rowSpan: 1 };
	const c = linePlacement(
		value(item.style, "grid-column-start"),
		value(item.style, "grid-column-end"),
		columns,
	);
	const r = linePlacement(
		value(item.style, "grid-row-start"),
		value(item.style, "grid-row-end"),
		rows,
	);
	return {
		span: c.span,
		rowSpan: r.span,
		...(c.start !== undefined && c.start < columns ? { col: c.start } : {}),
		...(r.start !== undefined ? { row: r.start } : {}),
	};
}

/** Auto margins take the free space before alignment does (css-grid-1 §11.2): where they put the item. */
function autoMarginAlign(item: ElementBox, start: string, end: string): string | undefined {
	const a = isAuto(item.style, `margin-${start}`);
	const b = isAuto(item.style, `margin-${end}`);
	if (a && b) return "center";
	if (a) return "end";
	if (b) return "start";
	return undefined;
}

/** An item's `align-self` / `justify-self`, `auto` taken from the container's `*-items`. */
export function selfAlign(
	_flow: Flow,
	item: ElementBox,
	axis: "align" | "justify",
	container: Computed,
): string {
	const self = value(item.style, `${axis}-self`);
	return self !== "auto" ? self : (container.get(`${axis}-items`) ?? "normal").trim();
}

/** Whether an item stretches to its area in an axis (normal / stretch, auto size, no auto margins). */
export function stretches(
	flow: Flow,
	item: ElementBox | TextRun,
	axis: "align" | "justify",
	container: Computed,
): boolean {
	if (item.type === "text") return true;
	const a = selfAlign(flow, item, axis, container);
	if (!/^(normal|stretch)$/.test(a)) return false;
	const size = axis === "justify" ? "width" : "height";
	if (!isAuto(item.style, size)) return false;
	const [s1, s2] = axis === "justify" ? (["left", "right"] as const) : (["top", "bottom"] as const);
	if (isAuto(item.style, `margin-${s1}`) || isAuto(item.style, `margin-${s2}`)) return false;
	// normal: items with an aspect ratio or a natural size don't stretch.
	if (a === "normal" && (item.kind === "replaced" || aspectRatio(item.style))) return false;
	return true;
}

/**
 * Where `n` tracks (or lines) start and the extra space between them, for a
 * `align-content` / `justify-content` value and the free space
 * (css-align-3 §5.3). Negative free space falls back as the spec says:
 * space-between to start, space-around / space-evenly to center.
 */
export function distribute(
	free: number,
	n: number,
	value: string,
): { start: number; between: number } {
	const v = value.replace(/^(safe|unsafe)\s+/, "");
	if (n <= 0) return { start: 0, between: 0 };
	if (free < 0 && /^space-(around|evenly)$/.test(v)) return { start: free / 2, between: 0 };
	if (free < 0 && v === "space-between") return { start: 0, between: 0 };
	switch (v) {
		case "center":
			return { start: free / 2, between: 0 };
		case "end":
		case "flex-end":
		case "right":
			return { start: free, between: 0 };
		case "space-between":
			return { start: 0, between: n > 1 ? free / (n - 1) : 0 };
		case "space-around":
			return { start: free / n / 2, between: free / n };
		case "space-evenly":
			return { start: free / (n + 1), between: free / (n + 1) };
		default:
			return { start: 0, between: 0 };
	}
}

/** A grid container's content sizes: its columns, each as wide as its widest single-column item. */
export function gridSizes(flow: Flow, box: ElementBox): Sizes {
	const kids = box.children.filter((c) => !flow.absolute(c));
	const each = kids.map((k) => flow.contribution(k));
	const gap = lengthOf(flow.ctx, box.style, "column-gap") ?? 0;
	const tracks = gridTracks(flow, box.style, undefined, 0, gap, kids.length);
	const n = Math.max(1, tracks.length);
	const placed = placeGrid(
		kids.map((k) => areaOf(k, n, 0)),
		n,
	);
	const per = (key: "min" | "max") => {
		const cols = Array<number>(n).fill(0);
		for (const [i, p] of placed.entries()) {
			const c = each[i];
			if (c && p.span === 1) cols[p.col] = Math.max(cols[p.col] ?? 0, c[key]);
		}
		return sum(cols) + gap * (n - 1);
	};
	return { min: per("min"), max: per("max") };
}
