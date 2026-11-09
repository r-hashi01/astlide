import { describe, expect, it } from "vitest";
import { frSizes, linePlacement, parseTracks, placeGrid, sizeTracks } from "../src/engine/grid";

const px = (v: string) => {
	const m = v.match(/^([\d.]+)px$/);
	return m ? Number(m[1]) : Number.NaN;
};

describe("grid columns", () => {
	it("parses fixed, fr, auto, minmax() and repeat()", () => {
		expect(parseTracks("auto 1fr", px, 600, 0)).toEqual([
			{ kind: "auto", min: 0 },
			{ kind: "fr", fr: 1, min: 0, minAuto: true },
		]);
		expect(parseTracks("[a] 100px [b] repeat(2, 1fr)", px, 600, 0)).toEqual([
			{ kind: "fixed", px: 100 },
			{ kind: "fr", fr: 1, min: 0, minAuto: true },
			{ kind: "fr", fr: 1, min: 0, minAuto: true },
		]);
		expect(parseTracks("minmax(80px, 1fr) minmax(0, 200px)", px, 600, 0)).toEqual([
			{ kind: "fr", fr: 1, min: 80 },
			{ kind: "fixed", px: 200 },
		]);
		expect(parseTracks("none", px, 600, 0)).toEqual([{ kind: "auto", min: 0 }]);
	});

	it("repeats auto-fill tracks as often as they fit", () => {
		expect(parseTracks("repeat(auto-fill, minmax(200px, 1fr))", px, 650, 10)).toHaveLength(3);
		expect(parseTracks("repeat(auto-fit, minmax(200px, 1fr))", px, 100, 10)).toHaveLength(1);
	});

	it("sizes auto columns to content and shares the rest among fr columns", () => {
		const tracks = parseTracks("auto 1fr", px, 600, 0);
		expect(sizeTracks(tracks, 600, 20, [64, 300])).toEqual([64, 516]);
		const footer = parseTracks("1fr auto 1fr", px, 900, 0);
		expect(sizeTracks(footer, 900, 0, [0, 100, 0])).toEqual([400, 100, 400]);
	});

	it("stretches auto columns when there's no fr column", () => {
		expect(sizeTracks(parseTracks("100px auto", px, 500, 0), 500, 0, [50, 50])).toEqual([100, 400]);
	});

	it("places items in order, spans and row ends", () => {
		expect(linePlacement("span 2", "auto", 3)).toEqual({ span: 2 });
		expect(linePlacement("1", "-1", 3)).toEqual({ start: 0, span: 3 });
		expect(linePlacement("auto", "auto", 3)).toEqual({ span: 1 });
		const cols = (spans: number[]) => spans.map((span) => ({ span, rowSpan: 1 }));
		// Sparse: a 3-span skips to a new row; 2-spans don't backfill the gaps.
		expect(placeGrid(cols([1, 1, 3, 2, 2]), 3)).toEqual([
			{ col: 0, span: 1, row: 0, rowSpan: 1 },
			{ col: 1, span: 1, row: 0, rowSpan: 1 },
			{ col: 0, span: 3, row: 1, rowSpan: 1 },
			{ col: 0, span: 2, row: 2, rowSpan: 1 },
			{ col: 0, span: 2, row: 3, rowSpan: 1 },
		]);
	});

	it("places items spanning rows, and items with a start column (§8.5)", () => {
		expect(linePlacement("span 2", "auto", 0)).toEqual({ span: 2 });
		expect(linePlacement("2", "auto", 3)).toEqual({ start: 1, span: 1 });
		// The second column's item spans two rows: the next row's items flow around it.
		expect(
			placeGrid(
				[
					{ span: 1, rowSpan: 1 },
					{ span: 1, rowSpan: 2 },
					{ span: 1, rowSpan: 1 },
					{ span: 1, rowSpan: 1 },
					{ span: 1, rowSpan: 1 },
				],
				3,
			).map((a) => [a.row, a.col]),
		).toEqual([
			[0, 0],
			[0, 1],
			[0, 2],
			[1, 0],
			[1, 2],
		]);
		// A start column before the cursor goes to the next row.
		expect(
			placeGrid(
				[
					{ span: 1, rowSpan: 1 },
					{ span: 1, rowSpan: 1, col: 0 },
				],
				3,
			).map((a) => [a.row, a.col]),
		).toEqual([
			[0, 0],
			[1, 0],
		]);
	});

	it("reads line numbers: negative ones from the end, span before or after", () => {
		expect(linePlacement("1", "3", 3)).toEqual({ start: 0, span: 2 });
		expect(linePlacement("2", "-1", 3)).toEqual({ start: 1, span: 2 });
		expect(linePlacement("3", "1", 3)).toEqual({ start: 0, span: 2 });
		expect(linePlacement("2", "span 2", 3)).toEqual({ start: 1, span: 2 });
		expect(linePlacement("span 2", "4", 3)).toEqual({ start: 1, span: 2 });
		expect(linePlacement("auto", "3", 3)).toEqual({ start: 1, span: 1 });
		expect(linePlacement("header", "auto", 3)).toEqual({ span: 1 });
	});

	it("places items with a row first, then the others around them", () => {
		expect(
			placeGrid(
				[
					{ span: 1, rowSpan: 1 },
					{ span: 1, rowSpan: 1, row: 0, col: 0 },
					{ span: 1, rowSpan: 1 },
				],
				2,
			),
		).toEqual([
			{ col: 1, span: 1, row: 0, rowSpan: 1 },
			{ col: 0, span: 1, row: 0, rowSpan: 1 },
			{ col: 0, span: 1, row: 1, rowSpan: 1 },
		]);
	});

	it("keeps an fr track's minimum and shares the rest among the others (§11.7.1)", () => {
		const tracks = parseTracks("minmax(600px, 1fr) 1fr", Number.parseFloat, 1000, 0);
		expect(sizeTracks(tracks, 1000, 0, [0, 0])).toEqual([600, 400]);
		expect(frSizes(parseTracks("1fr 3fr", Number.parseFloat, 400, 0), [0, 0], 400)).toEqual([
			100, 300,
		]);
	});
});
