/**
 * The box model (CSS 2 §8, §10; css-sizing-3): a box's padding, border and
 * margins, and its set sizes and limits, resolved once against its
 * containing block. Sizes come out as border-box sizes whatever
 * `box-sizing` says, so layout code works in one kind of size and converts
 * to the content box only through {@link contentWidth} / {@link contentHeight}.
 */

import type { StyleContext } from "./box-tree";
import type { Computed } from "./cascade";
import { isAuto, keyword, value } from "./properties";

export interface Sides {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export const SIDES = ["top", "right", "bottom", "left"] as const;
export type Side = (typeof SIDES)[number];

/** What percentages resolve against: the containing block's width and height (absent: indefinite). */
export interface Basis {
	width?: number;
	height?: number;
}

export interface BoxModel {
	padding: Sides;
	border: Sides;
	/** Margins in px; `auto` ones are 0 here (see `autoMargin`). */
	margin: Sides;
	/** Margins that are `auto`: they take free space. */
	autoMargin: Record<Side, boolean>;
	/** Padding + border per axis: the border box less the content box. */
	inset: { x: number; y: number };
	/** Set border-box sizes: undefined when auto, a keyword, or a percentage of an indefinite size. */
	width?: number;
	height?: number;
	/** Limits on the border-box size (min-width: auto is 0 here). */
	min: { width: number; height: number };
	max: { width: number; height: number };
	/** `aspect-ratio` as width / height; 0 without one. */
	ratio: number;
}

const KEYWORD = /^(auto|none|normal|)$|^(fit|min|max)-content$|^fit-content\(/;

/**
 * A length property in px; percentages against `basis` (undefined when
 * indefinite); keywords (auto, none, min-content …) undefined.
 */
export function lengthOf(
	ctx: StyleContext,
	style: Computed,
	prop: string,
	basis?: number,
): number | undefined {
	const raw = value(style, prop);
	if (KEYWORD.test(raw)) return undefined;
	const pct = raw.match(/^(-?[\d.]+)%$/);
	if (pct) return basis === undefined ? undefined : (Number(pct[1]) / 100) * basis;
	const v = ctx.px(style, prop, basis ?? Number.NaN);
	return Number.isNaN(v) ? undefined : v;
}

/**
 * Padding and border widths. Percentage padding is of the containing
 * block's width, 0 when that's indefinite (as for intrinsic sizes).
 */
export function edgesOf(
	ctx: StyleContext,
	style: Computed,
	basisWidth?: number,
): { padding: Sides; border: Sides } {
	const padding = { top: 0, right: 0, bottom: 0, left: 0 };
	const border = { top: 0, right: 0, bottom: 0, left: 0 };
	for (const s of SIDES) {
		padding[s] = Math.max(0, lengthOf(ctx, style, `padding-${s}`, basisWidth ?? 0) ?? 0);
		border[s] = Math.max(ctx.px(style, `border-${s}-width`), 0);
	}
	return { padding, border };
}

/** Margins in px (auto as 0); percentages of the containing block's width, 0 when indefinite. */
export function marginsOf(ctx: StyleContext, style: Computed, basisWidth?: number): Sides {
	const out = { top: 0, right: 0, bottom: 0, left: 0 };
	for (const s of SIDES) out[s] = lengthOf(ctx, style, `margin-${s}`, basisWidth ?? 0) ?? 0;
	return out;
}

/** `aspect-ratio` as width / height; 0 without one. */
export function aspectRatio(style: Computed): number {
	const ar = value(style, "aspect-ratio").match(/([\d.]+)\s*(?:\/\s*([\d.]+))?/);
	return ar && Number(ar[1]) > 0 ? Number(ar[1]) / Number(ar[2] ?? 1) : 0;
}

/**
 * A box's box model against `basis`. `borders` replaces its own border
 * widths (a cell in a collapsed-border table keeps half of each).
 */
export function boxModel(
	ctx: StyleContext,
	style: Computed,
	basis: Basis = {},
	borders?: Sides,
): BoxModel {
	const edges = edgesOf(ctx, style, basis.width);
	const border = borders ?? edges.border;
	const { padding } = edges;
	const inset = {
		x: padding.left + padding.right + border.left + border.right,
		y: padding.top + padding.bottom + border.top + border.bottom,
	};
	const borderBox = keyword(style, "box-sizing") === "border-box";
	/** A set size as a border-box size. */
	const size = (prop: string, against: number | undefined, extra: number) => {
		const v = lengthOf(ctx, style, prop, against);
		return v === undefined ? undefined : borderBox ? v : v + extra;
	};
	const autoMargin = { top: false, right: false, bottom: false, left: false };
	for (const s of SIDES) autoMargin[s] = isAuto(style, `margin-${s}`);
	return {
		padding,
		border,
		margin: marginsOf(ctx, style, basis.width),
		autoMargin,
		inset,
		width: size("width", basis.width, inset.x),
		height: size("height", basis.height, inset.y),
		min: {
			width: size("min-width", basis.width, inset.x) ?? 0,
			height: size("min-height", basis.height, inset.y) ?? 0,
		},
		max: {
			width: size("max-width", basis.width, inset.x) ?? Number.POSITIVE_INFINITY,
			height: size("max-height", basis.height, inset.y) ?? Number.POSITIVE_INFINITY,
		},
		ratio: aspectRatio(style),
	};
}

/**
 * Another set size (`flex-basis` …) as a border-box size along an axis;
 * undefined when auto, a keyword, or a percentage of an indefinite `basis`.
 */
export function setSize(
	ctx: StyleContext,
	style: Computed,
	bm: BoxModel,
	prop: string,
	basis: number | undefined,
	axis: "x" | "y",
): number | undefined {
	const v = lengthOf(ctx, style, prop, basis);
	if (v === undefined) return undefined;
	return keyword(style, "box-sizing") === "border-box" ? v : v + bm.inset[axis];
}

/** A box model seen along a flex container's axes: main and cross sizes and limits. */
export function alongAxes(bm: BoxModel, column: boolean) {
	const x = { size: bm.width, min: bm.min.width, max: bm.max.width, inset: bm.inset.x };
	const y = { size: bm.height, min: bm.min.height, max: bm.max.height, inset: bm.inset.y };
	return column ? { main: y, cross: x } : { main: x, cross: y };
}

/** A border-box width within the box's min / max-width (the min wins, CSS 2 §10.4). */
export function clampWidth(bm: BoxModel, w: number): number {
	return Math.max(bm.min.width, Math.min(bm.max.width, w));
}

export function clampHeight(bm: BoxModel, h: number): number {
	return Math.max(bm.min.height, Math.min(bm.max.height, h));
}

/** The content-box width of a border-box width. */
export function contentWidth(bm: BoxModel, borderBoxWidth: number): number {
	return Math.max(0, borderBoxWidth - bm.inset.x);
}

export function contentHeight(bm: BoxModel, borderBoxHeight: number): number {
	return Math.max(0, borderBoxHeight - bm.inset.y);
}

/** The margin-box size added to a border-box size, per axis. */
export function outerWidth(bm: BoxModel, borderBoxWidth: number): number {
	return borderBoxWidth + bm.margin.left + bm.margin.right;
}

export function outerHeight(bm: BoxModel, borderBoxHeight: number): number {
	return borderBoxHeight + bm.margin.top + bm.margin.bottom;
}

/** A picture's own size: width / height attributes or its file, and its ratio (width / height). */
export interface NaturalSize {
	w?: number;
	h?: number;
	ratio?: number;
}

/**
 * A replaced element's content-box size when width and height are both
 * auto (CSS 2 §10.3.2, §10.6.2): its natural size, a missing dimension
 * from the other and the ratio, then the min / max limits applied keeping
 * the ratio (the table in §10.4). `fallback`: the size without one (an
 * `<img>` with nothing to go on is 0×0, other replaced elements 300×150).
 */
export function replacedSize(
	bm: BoxModel,
	natural: NaturalSize,
	ratio: number | undefined,
	fallback: { w: number; h: number },
): { w: number; h: number } {
	let w = natural.w;
	let h = natural.h;
	if (w === undefined && h !== undefined && ratio) w = h * ratio;
	if (h === undefined && w !== undefined && ratio) h = w / ratio;
	w ??= fallback.w;
	h ??= ratio && w ? w / ratio : fallback.h;
	if (!ratio || w <= 0 || h <= 0) return { w, h };
	// Limits as content-box sizes; a max below its min is raised to it.
	const minW = contentWidth(bm, bm.min.width);
	const minH = contentHeight(bm, bm.min.height);
	const maxW = Math.max(minW, bm.max.width - bm.inset.x);
	const maxH = Math.max(minH, bm.max.height - bm.inset.y);
	const tooWide = w > maxW;
	const tooTall = h > maxH;
	const tooNarrow = w < minW;
	const tooShort = h < minH;
	if (tooWide && tooTall)
		return maxW / w <= maxH / h
			? { w: maxW, h: Math.max(minH, (maxW * h) / w) }
			: { w: Math.max(minW, (maxH * w) / h), h: maxH };
	if (tooNarrow && tooShort)
		return minW / w <= minH / h
			? { w: Math.min(maxW, (minH * w) / h), h: minH }
			: { w: minW, h: Math.min(maxH, (minW * h) / w) };
	if (tooNarrow && tooTall) return { w: minW, h: maxH };
	if (tooWide && tooShort) return { w: maxW, h: minH };
	if (tooWide) return { w: maxW, h: Math.max((maxW * h) / w, minH) };
	if (tooNarrow) return { w: minW, h: Math.min((minW * h) / w, maxH) };
	if (tooTall) return { w: Math.max((maxH * w) / h, minW), h: maxH };
	if (tooShort) return { w: Math.min((minH * w) / h, maxW), h: minH };
	return { w, h };
}
