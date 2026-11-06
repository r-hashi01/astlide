/**
 * Laid-out tables as native PowerPoint tables.
 *
 * @module
 */

import type { Box, TableBox } from "@astlide/core/engine";
import type { Engine, TextItem } from "./common";
import type { CellBorder, TableCellSpec, TableSpec } from "./ooxml/spec";
import { blockText } from "./text";

/**
 * A laid-out table as a native PowerPoint table: the column grid and row
 * heights, each cell's background, borders, padding (as margins) and text.
 */
export function tableSpec(
	engine: Engine,
	t: TableBox,
	items: TextItem[],
	boxes: Box[],
	k: number,
): Omit<TableSpec, "type"> {
	const styleOf = (eid: number) => boxes.find((b) => b.eid === eid);
	const pt = (px: number) => px * k * 72;
	const color = (c: { hex: string; alpha: number } | null) =>
		c && c.alpha > 0
			? { color: c.hex.toUpperCase(), transparency: Math.round((1 - c.alpha) * 100) }
			: null;
	const n = Math.max(
		t.columns.length,
		...t.rows.flatMap((r) => r.cells.map((c) => c.col + c.span)),
	);
	const known = t.columns.filter((w) => w > 0);
	const fallback = known.length
		? (t.w - known.reduce((a, b) => a + b, 0)) / Math.max(1, n - known.length)
		: t.w / n;
	const columns = [...Array(n).keys()].map((i) => (t.columns[i] || fallback) * k);
	const rows = t.rows.map((r) => {
		const cells: TableCellSpec[] = [];
		const rowBox = styleOf(r.eid);
		for (const c of [...r.cells].sort((a, b) => a.col - b.col)) {
			while (cells.length < c.col) cells.push({ runs: [] });
			const inside = items.filter((it) => {
				const cx = it.x + it.w / 2;
				const cy = it.y + it.h / 2;
				return cx >= c.x && cx <= c.x + c.w && cy >= c.y && cy <= c.y + c.h;
			});
			const byBlock = new Map<number, TextItem[]>();
			for (const it of inside) {
				const id = it.block?.id ?? -1;
				byBlock.set(id, [...(byBlock.get(id) ?? []), it]);
			}
			const runs = [...byBlock.values()]
				.map((g) => blockText(g, k))
				.filter((b) => b !== null)
				.sort((a, b) => a.top - b.top)
				.flatMap((b) => b.runs);
			const alpha = styleOf(c.eid)?.alpha ?? 1;
			const bg =
				color(engine.parseColor(c.style.get("background-color"))) ??
				color(rowBox ? engine.parseColor(rowBox.style.get("background-color")) : null);
			const side = (s: "top" | "right" | "bottom" | "left"): CellBorder | undefined => {
				const c2 = color(
					engine.parseColor(c.style.get(`border-${s}-color`) ?? c.style.get("color")),
				);
				return c.border[s] > 0 && c2 ? { ...c2, width: pt(c.border[s]) } : undefined;
			};
			const va = c.style.get("vertical-align") ?? "middle";
			cells.push({
				runs,
				fill: bg?.color,
				fillTransparency: bg ? Math.round(100 - (100 - bg.transparency) * alpha) : undefined,
				borders: {
					top: side("top"),
					right: side("right"),
					bottom: side("bottom"),
					left: side("left"),
				},
				margins: {
					top: c.padding.top * k,
					right: c.padding.right * k,
					bottom: c.padding.bottom * k,
					left: c.padding.left * k,
				},
				valign: va === "top" ? "top" : va === "bottom" ? "bottom" : "middle",
				span: c.span,
			});
			for (let i = 1; i < c.span; i++) cells.push({ runs: [], merged: true });
		}
		while (cells.length < n) cells.push({ runs: [] });
		return { h: r.h * k, cells };
	});
	return {
		x: t.x * k,
		y: t.y * k,
		w: columns.reduce((a, b) => a + b, 0),
		h: t.h * k,
		columns,
		rows,
	};
}
