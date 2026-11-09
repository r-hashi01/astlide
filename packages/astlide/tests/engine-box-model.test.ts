import { describe, expect, it } from "vitest";
import { type BoxModel, replacedSize } from "../src/engine/box-model";

/** A box model with no padding or border and the given limits. */
const limits = (min: { w?: number; h?: number }, max: { w?: number; h?: number }): BoxModel => ({
	padding: { top: 0, right: 0, bottom: 0, left: 0 },
	border: { top: 0, right: 0, bottom: 0, left: 0 },
	margin: { top: 0, right: 0, bottom: 0, left: 0 },
	autoMargin: { top: false, right: false, bottom: false, left: false },
	inset: { x: 0, y: 0 },
	min: { width: min.w ?? 0, height: min.h ?? 0 },
	max: { width: max.w ?? Number.POSITIVE_INFINITY, height: max.h ?? Number.POSITIVE_INFINITY },
	ratio: 0,
});

describe("replaced size (CSS 2 §10.4)", () => {
	const photo = { w: 400, h: 200, ratio: 2 };
	const size = (bm: BoxModel) => replacedSize(bm, photo, 2, { w: 300, h: 150 });

	it("keeps the natural size within the limits", () => {
		expect(size(limits({}, {}))).toEqual({ w: 400, h: 200 });
	});

	it("keeps the ratio when one limit applies", () => {
		expect(size(limits({}, { h: 100 }))).toEqual({ w: 200, h: 100 });
		expect(size(limits({}, { w: 100 }))).toEqual({ w: 100, h: 50 });
		expect(size(limits({ w: 800 }, {}))).toEqual({ w: 800, h: 400 });
	});

	it("follows the tighter limit when both are exceeded", () => {
		expect(size(limits({}, { w: 300, h: 100 }))).toEqual({ w: 200, h: 100 });
		expect(size(limits({}, { w: 100, h: 100 }))).toEqual({ w: 100, h: 50 });
	});

	it("gives up the ratio when the limits can't both hold it", () => {
		expect(size(limits({ w: 500 }, { h: 100 }))).toEqual({ w: 500, h: 100 });
	});

	it("derives a missing natural dimension from the ratio", () => {
		expect(replacedSize(limits({}, {}), { w: 400 }, 2, { w: 0, h: 0 })).toEqual({ w: 400, h: 200 });
	});
});
