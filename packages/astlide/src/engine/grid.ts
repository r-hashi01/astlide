/**
 * CSS grid tracks, the cases slides use: track lists with fixed lengths,
 * `fr`, `auto`, `minmax()` and `repeat()` (a count, `auto-fill`,
 * `auto-fit`), and items placed by line numbers (`grid-column: 2 / -1`,
 * `span N`) or in order (auto-placement). Named lines and areas aren't
 * supported (such items are auto-placed).
 */

/** A column track. */
export type Track =
	| { kind: "fixed"; px: number }
	/** `minAuto`: the minimum is `auto` (a plain `1fr`): at least the content. */
	| { kind: "fr"; fr: number; min: number; minAuto?: boolean }
	| { kind: "auto"; min: number };

/** Top-level tokens of a track list: `minmax(…)`, `repeat(…)` stay whole; `[names]` are dropped. */
function tokens(list: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = "";
	for (const ch of list.replace(/\[[^\]]*\]/g, " ")) {
		if (ch === "(") depth++;
		if (ch === ")") depth--;
		if (/\s/.test(ch) && depth === 0) {
			if (cur) out.push(cur);
			cur = "";
		} else cur += ch;
	}
	if (cur) out.push(cur);
	return out;
}

/** Split `a, b` at top-level commas. */
function args(inner: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = "";
	for (const ch of inner) {
		if (ch === "(") depth++;
		if (ch === ")") depth--;
		if (ch === "," && depth === 0) {
			out.push(cur.trim());
			cur = "";
		} else cur += ch;
	}
	out.push(cur.trim());
	return out;
}

function track(token: string, length: (v: string) => number): Track {
	const fr = token.match(/^([\d.]+)fr$/);
	if (fr) return { kind: "fr", fr: Number(fr[1]), min: 0, minAuto: true };
	const mm = token.match(/^minmax\((.*)\)$/);
	if (mm) {
		const [lo = "auto", hi = "auto"] = args(mm[1] ?? "");
		const min = length(lo);
		const hiFr = hi.match(/^([\d.]+)fr$/);
		if (hiFr)
			return Number.isNaN(min)
				? { kind: "fr", fr: Number(hiFr[1]), min: 0, minAuto: true }
				: { kind: "fr", fr: Number(hiFr[1]), min };
		const max = length(hi);
		if (!Number.isNaN(max))
			return { kind: "fixed", px: Math.max(max, Number.isNaN(min) ? 0 : min) };
		return { kind: "auto", min: Number.isNaN(min) ? 0 : min };
	}
	const px = length(token);
	return Number.isNaN(px) ? { kind: "auto", min: 0 } : { kind: "fixed", px };
}

/** The smallest a track can be, for counting `auto-fill` repetitions. */
const minSize = (t: Track) => (t.kind === "fixed" ? t.px : t.min);

/**
 * Parse `grid-template-columns` for a container whose content box is `inner`
 * px wide. `length` resolves a length to px (NaN for keywords). No columns
 * (`none`) is one `auto` column. With `items`, `auto-fit` keeps only as many
 * repetitions as there are items (empty tracks collapse, css-grid-1 §7.2.3.2).
 */
export function parseTracks(
	template: string,
	length: (v: string) => number,
	inner: number,
	gap: number,
	items?: number,
): Track[] {
	const out: Track[] = [];
	for (const token of tokens(template.trim() === "none" ? "" : template)) {
		const rep = token.match(/^repeat\((.*)\)$/);
		if (!rep) {
			out.push(track(token, length));
			continue;
		}
		const [count = "1", ...rest] = args(rep[1] ?? "");
		const unit = tokens(rest.join(", ")).map((t) => track(t, length));
		if (unit.length === 0) continue;
		let n = Number.parseInt(count, 10);
		if (/^auto-(fill|fit)$/.test(count)) {
			const size = unit.reduce((s, t) => s + minSize(t), 0) + gap * unit.length;
			// Zero-sized tracks fit any number of times: as many as there are items.
			n = size > 0 ? Math.max(1, Math.floor((inner + gap) / size)) : Math.max(1, items ?? 1);
			if (count === "auto-fit" && items !== undefined)
				n = Math.max(1, Math.min(n, Math.ceil(items / unit.length)));
		}
		for (let i = 0; i < (Number.isFinite(n) ? n : 1); i++) out.push(...unit);
	}
	return out.length > 0 ? out : [{ kind: "auto", min: 0 }];
}

/**
 * A grid's column tracks: the template's, plus, with `grid-auto-flow:
 * column`, an implicit column for each item beyond them, sized by
 * `grid-auto-columns` (its pattern repeated; css-grid-1 §7.6).
 */
export function columnTracks(
	template: string,
	autoFlow: string,
	autoColumns: string,
	length: (v: string) => number,
	inner: number,
	gap: number,
	items: number,
): Track[] {
	const explicit = parseTracks(template, length, inner, gap, items);
	if (!/column/.test(autoFlow)) return explicit;
	const none = template.trim() === "none" || template.trim() === "";
	const out = none ? [] : explicit;
	const pattern = tokens(autoColumns.trim() || "auto").map((t) => track(t, length));
	for (let i = 0; out.length < items && pattern.length > 0; i++)
		out.push(pattern[i % pattern.length] as Track);
	return out.length > 0 ? out : explicit;
}

/**
 * Track widths: fixed tracks as given, `auto` tracks as wide as their widest
 * single-column item (`content`), `fr` tracks share what's left; with no `fr`
 * track, `auto` tracks share the leftover space (they stretch).
 */
export function sizeTracks(
	tracks: readonly Track[],
	inner: number,
	gap: number,
	content: readonly number[],
): number[] {
	const avail = inner - gap * (tracks.length - 1);
	const base = tracks.map((t, i) =>
		t.kind === "fixed" ? t.px : t.kind === "auto" ? Math.max(t.min, content[i] ?? 0) : 0,
	);
	const fixedSum = base.reduce((s, w) => s + w, 0);
	const frSum = tracks.reduce((s, t) => s + (t.kind === "fr" ? t.fr : 0), 0);
	// fr tracks start from their minimum (`minmax(600px, 1fr)`).
	if (frSum > 0)
		return frSizes(
			tracks,
			tracks.map((t, i) => (t.kind === "fr" ? t.min : (base[i] ?? 0))),
			avail,
		);
	const autos = tracks.filter((t) => t.kind === "auto").length;
	const free = avail - fixedSum;
	if (autos === 0 || free <= 0) return base;
	return tracks.map((t, i) => (base[i] ?? 0) + (t.kind === "auto" ? free / autos : 0));
}

/**
 * Flexible track sizes (css-grid-1 §11.7.1, "find the size of an fr"): the
 * space left after the other tracks (`base`) is shared by `fr`; a track
 * whose share is below its minimum keeps its minimum and the rest is shared
 * again. Other tracks keep `base`.
 */
export function frSizes(
	tracks: readonly Track[],
	base: readonly number[],
	avail: number,
): number[] {
	const out = [...base];
	const flexible = new Set(tracks.flatMap((t, i) => (t.kind === "fr" ? [i] : [])));
	for (;;) {
		let left = avail;
		let frSum = 0;
		for (const [i, t] of tracks.entries()) {
			if (flexible.has(i) && t.kind === "fr") frSum += t.fr;
			else left -= out[i] ?? 0;
		}
		const unit = frSum > 0 ? Math.max(0, left) / frSum : 0;
		let fixedOne = false;
		for (const i of flexible) {
			const t = tracks[i];
			if (t?.kind !== "fr") continue;
			const min = base[i] ?? t.min;
			if (t.fr * unit < min) {
				out[i] = min;
				flexible.delete(i);
				fixedOne = true;
			} else out[i] = t.fr * unit;
		}
		if (!fixedOne) return out;
	}
}

/** Where an item goes along one axis: its 0-based start line, if fixed, and its span. */
export interface LinePlacement {
	start?: number;
	span: number;
}

/**
 * An item's placement along an axis from its `grid-*-start` / `grid-*-end`
 * (css-grid-1 §8.3): line numbers (negative ones count from the end of the
 * `explicit` tracks), `span N` and `auto`. Named lines count as `auto`.
 */
export function linePlacement(start: string, end: string, explicit: number): LinePlacement {
	const line = (v: string): number | undefined => {
		const n = v.trim().match(/^(-?\d+)$/);
		if (!n) return undefined;
		const k = Number(n[1]);
		if (k === 0) return undefined;
		// 0-based line index: 1 → 0; -1 → the last explicit line.
		return k > 0 ? k - 1 : Math.max(0, explicit + 1 + k);
	};
	const span = (v: string): number | undefined => {
		const m = v.trim().match(/^span\s+(\d+)$/);
		return m ? Math.max(1, Number(m[1])) : undefined;
	};
	const s = line(start);
	const e = line(end);
	if (s !== undefined && e !== undefined) {
		if (s === e) return { start: s, span: 1 };
		return { start: Math.min(s, e), span: Math.abs(e - s) };
	}
	if (s !== undefined) return { start: s, span: span(end) ?? 1 };
	if (e !== undefined) {
		const n = span(start) ?? 1;
		return { start: Math.max(0, e - n), span: Math.min(n, Math.max(1, e)) };
	}
	return { span: span(start) ?? span(end) ?? 1 };
}

/** Where an item went: its first column and row, and how many of each it spans. */
export interface GridArea {
	col: number;
	span: number;
	row: number;
	rowSpan: number;
}

/**
 * Placement (css-grid-1 §8.5, row flow, sparse): items with a row go there
 * first (in the column they name, else the first free one); then the others
 * go in the first area from the cursor that's free for their spans — an
 * item with a column in that column, on the cursor's row or a later one.
 */
export function placeGrid(
	items: readonly { span: number; rowSpan: number; col?: number; row?: number }[],
	columns: number,
): GridArea[] {
	const taken = new Set<string>();
	const free = (row: number, col: number, span: number, rows: number) => {
		for (let r = row; r < row + rows; r++)
			for (let c = col; c < col + span; c++) if (taken.has(`${r},${c}`)) return false;
		return true;
	};
	const take = (a: GridArea) => {
		for (let r = a.row; r < a.row + a.rowSpan; r++)
			for (let c = a.col; c < a.col + a.span; c++) taken.add(`${r},${c}`);
	};
	const out: (GridArea | undefined)[] = items.map(() => undefined);
	for (const [i, item] of items.entries()) {
		if (item.row === undefined) continue;
		const span = Math.max(1, Math.min(item.span, columns));
		const rows = Math.max(1, item.rowSpan);
		let col = item.col !== undefined ? Math.min(item.col, columns - span) : 0;
		if (item.col === undefined)
			while (col + span <= columns && !free(item.row, col, span, rows)) col++;
		if (col + span > columns) col = 0;
		const area = { col, span, row: item.row, rowSpan: rows };
		take(area);
		out[i] = area;
	}
	let row = 0;
	let col = 0;
	for (const [i, item] of items.entries()) {
		if (item.row !== undefined) continue;
		const span = Math.max(1, Math.min(item.span, columns));
		const rows = Math.max(1, item.rowSpan);
		if (item.col !== undefined) {
			const at = Math.min(item.col, columns - span);
			if (at < col) row++;
			while (!free(row, at, span, rows)) row++;
			col = at;
		} else
			for (;;) {
				if (col + span > columns) {
					row++;
					col = 0;
					continue;
				}
				if (free(row, col, span, rows)) break;
				col++;
			}
		const area = { col, span, row, rowSpan: rows };
		take(area);
		out[i] = area;
		col += span;
	}
	return out as GridArea[];
}
