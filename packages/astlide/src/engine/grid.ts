/**
 * CSS grid columns, the cases slides use: `grid-template-columns` with fixed
 * lengths, `fr`, `auto`, `minmax()` and `repeat()` (a count, `auto-fill`,
 * `auto-fit`), and items placed in order, spanning columns with
 * `grid-column: span N` or `1 / -1`. Rows are the flex lines the layout wraps
 * the items into.
 */

/** A column track. */
export type Track =
	| { kind: "fixed"; px: number }
	| { kind: "fr"; fr: number; min: number }
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
	if (fr) return { kind: "fr", fr: Number(fr[1]), min: 0 };
	const mm = token.match(/^minmax\((.*)\)$/);
	if (mm) {
		const [lo = "auto", hi = "auto"] = args(mm[1] ?? "");
		const min = length(lo);
		const hiFr = hi.match(/^([\d.]+)fr$/);
		if (hiFr) return { kind: "fr", fr: Number(hiFr[1]), min: Number.isNaN(min) ? 0 : min };
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
	if (frSum > 0) {
		const unit = Math.max(0, avail - fixedSum) / frSum;
		return tracks.map((t, i) => (t.kind === "fr" ? Math.max(t.min, t.fr * unit) : (base[i] ?? 0)));
	}
	const autos = tracks.filter((t) => t.kind === "auto").length;
	const free = avail - fixedSum;
	if (autos === 0 || free <= 0) return base;
	return tracks.map((t, i) => (base[i] ?? 0) + (t.kind === "auto" ? free / autos : 0));
}

/** An item's column span from its `grid-column`: `span N`, or every column for `1 / -1`. */
export function columnSpan(gridColumn: string, columns: number): number {
	const v = gridColumn.trim();
	const span = v.match(/span\s+(\d+)/);
	if (span) return Math.min(columns, Number(span[1]));
	if (/^1\s*\/\s*-1$/.test(v)) return columns;
	return 1;
}

/** Where auto-placed items go: their first column, and whether each ends its row. */
export function placeItems(
	spans: readonly number[],
	columns: number,
): { col: number; span: number; rowEnd: boolean }[] {
	const out: { col: number; span: number; rowEnd: boolean }[] = [];
	let col = 0;
	for (const s of spans) {
		const span = Math.max(1, Math.min(s, columns));
		if (col + span > columns) {
			const prev = out[out.length - 1];
			if (prev) prev.rowEnd = true;
			col = 0;
		}
		out.push({ col, span, rowEnd: false });
		col += span;
		if (col >= columns) {
			const last = out[out.length - 1];
			if (last) last.rowEnd = true;
			col = 0;
		}
	}
	const last = out[out.length - 1];
	if (last) last.rowEnd = true;
	return out;
}
