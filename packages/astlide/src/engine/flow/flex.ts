/**
 * Flex layout (css-flexbox-1 §9).
 */

import { alongAxes, boxModel, clampWidth, lengthOf, setSize } from "../box-model";
import type { ElementBox, TextRun } from "../box-tree";
import { clipsOverflow, isAuto, keyword, value } from "../properties";

import type { Flow, Fragment, Placed, Sizes } from "./index";
import { sum } from "./util";

/**
 * A flex container's content, by css-flexbox-1 §9: flex base sizes and
 * hypothetical main sizes (§9.2), lines (§9.3), flexible lengths (§9.7),
 * cross sizes and stretching (§9.4), main- and cross-axis alignment
 * (§9.5, §9.6). Items are measured and laid out with `layout()`; a
 * flexed or stretched size is definite for the item's children (§9.8).
 */
export function layoutFlex(
	flow: Flow,
	box: ElementBox,
	cw: number,
	ch: number | undefined,
	/** The container's min / max content-box cross size, when its cross size is auto. */
	crossLimits?: { min: number; max: number },
): { kids: Placed[]; height: number; pending: Placed[] } {
	const { style } = box;
	const dir = keyword(style, "flex-direction");
	const column = dir.startsWith("column");
	const reverse = dir.endsWith("-reverse");
	const wrapValue = keyword(style, "flex-wrap");
	const wrap = wrapValue !== "nowrap";
	const mainGap =
		(column
			? lengthOf(flow.ctx, style, "row-gap", ch)
			: lengthOf(flow.ctx, style, "column-gap", cw)) ?? 0;
	const crossGap =
		(column
			? lengthOf(flow.ctx, style, "column-gap", cw)
			: lengthOf(flow.ctx, style, "row-gap", ch)) ?? 0;
	const mainSize = column ? ch : cw;
	const crossSize = column ? cw : ch;
	const alignItems = value(style, "align-items");

	const pending: Placed[] = [];
	const items: FlexItem[] = [];
	for (const child of box.children) {
		if (flow.absolute(child)) {
			pending.push({
				f: flow.layout(child, { available: cw, pctW: cw, pctH: ch, shrink: true }),
				x: 0,
				y: 0,
			});
			continue;
		}
		items.push(flexItem(flow, child, column, cw, ch, alignItems));
	}

	// Lines (§9.3): a single line unless wrapping into a definite main size.
	const lines: FlexItem[][] = [];
	if (!wrap || mainSize === undefined) lines.push(items);
	else {
		let line: FlexItem[] = [];
		let used = 0;
		for (const it of items) {
			const outer = it.hypo + it.mainMargins;
			if (line.length > 0 && used + mainGap + outer > mainSize + 0.01) {
				lines.push(line);
				line = [];
				used = 0;
			}
			used += (line.length > 0 ? mainGap : 0) + outer;
			line.push(it);
		}
		if (line.length > 0) lines.push(line);
	}

	// Flexible lengths (§9.7), then each item's cross size at its main size (§9.4).
	let contentMain = 0;
	for (const line of lines) {
		const gaps = mainGap * Math.max(0, line.length - 1);
		const avail = mainSize ?? sum(line.map((it) => it.hypo + it.mainMargins)) + gaps;
		resolveFlexibleLengths(line, avail, gaps);
		contentMain = Math.max(contentMain, sum(line.map((it) => it.target + it.mainMargins)) + gaps);
		// Cross sizes within the item's min / max (min-width / max-width in a column).
		for (const it of line)
			it.cross = Math.max(
				it.crossMin,
				Math.min(it.crossMax, flexCross(flow, it, column, cw, ch, crossSize)),
			);
	}
	const lineCross = lines.map((line) =>
		Math.max(0, ...line.map((it) => (it.cross ?? 0) + it.crossMargins)),
	);
	// A stretched item's height is definite once its line's is known (§9.8): its
	// children's percentage heights resolve against it, and so its width from its
	// content (an aspect-ratio child) can change. Size the line's main axis again
	// with those widths, keeping the line's cross size (as Chromium does).
	if (!column)
		lines.forEach((line, li) => {
			let changed = false;
			for (const it of line) {
				if (!it.stretch || !it.contentBase || it.box.type === "text") continue;
				const bm = boxModel(flow.ctx, it.box.style, { width: cw, height: ch });
				const stretched = Math.max(
					it.crossMin,
					Math.min(it.crossMax, (lineCross[li] ?? 0) - it.crossMargins),
				);
				const inner = Math.max(0, stretched - bm.inset.y);
				const base = Math.max(
					bm.inset.x,
					clampWidth(bm, flow.contentSizes(it.box, inner).max + bm.inset.x),
				);
				if (Math.abs(base - it.base) < 0.01) continue;
				it.base = base;
				it.hypo = Math.max(it.min, Math.min(it.max, base));
				changed = true;
			}
			if (!changed) return;
			const gaps = mainGap * Math.max(0, line.length - 1);
			const avail = mainSize ?? sum(line.map((it) => it.hypo + it.mainMargins)) + gaps;
			resolveFlexibleLengths(line, avail, gaps);
			contentMain = Math.max(
				0,
				...lines.map(
					(l) =>
						sum(l.map((it) => it.target + it.mainMargins)) + mainGap * Math.max(0, l.length - 1),
				),
			);
		});
	// A single line in a definite cross size takes all of it; otherwise it stays
	// within the container's min / max cross size (§9.4 step 8).
	if (lines.length === 1 && crossSize !== undefined) lineCross[0] = crossSize;
	else if (lines.length === 1 && crossLimits)
		lineCross[0] = Math.max(crossLimits.min, Math.min(crossLimits.max, lineCross[0] ?? 0));
	else if (crossSize !== undefined && lines.length > 1) {
		const ac = value(style, "align-content");
		const free = crossSize - sum(lineCross) - crossGap * (lines.length - 1);
		if (free > 0 && /^(normal|stretch)$/.test(ac))
			for (let i = 0; i < lineCross.length; i++)
				lineCross[i] = (lineCross[i] ?? 0) + free / lines.length;
	}

	const kids: Placed[] = [];
	const lineOrder = wrapValue === "wrap-reverse" ? [...lines.keys()].reverse() : [...lines.keys()];
	let crossAt = 0;
	const justify = value(style, "justify-content");
	for (const li of lineOrder) {
		const line = lines[li] ?? [];
		const stretchTo = lineCross[li] ?? 0;
		const avail = mainSize ?? contentMain;
		// Stretched items (§9.4 step 11) and the final layout of every item.
		for (const it of line) {
			if (it.stretch)
				it.cross = Math.max(it.crossMin, Math.min(it.crossMax, stretchTo - it.crossMargins));
			const w = column ? (it.cross ?? 0) : it.target;
			const h = column ? it.target : (it.cross ?? 0);
			it.f = flow.layout(it.box, {
				available: w,
				width: w,
				...(column || it.stretch || it.definiteCross ? { height: h } : {}),
				pctW: cw,
				...(ch !== undefined ? { pctH: ch } : {}),
			});
			if (!column && !it.stretch && !it.definiteCross) it.cross = it.f.h;
		}
		// Baseline alignment in a row (§8.5): the items' first baselines line up,
		// at the deepest one; the line holds what's above and below it.
		const baselineOf = new Map<FlexItem, number>();
		if (!column)
			for (const it of line) {
				if (!/baseline/.test(it.align) || it.autoCrossStart || it.autoCrossEnd) continue;
				const f = it.f as Fragment;
				baselineOf.set(it, it.crossStart + (flow.baseline(f, false) ?? f.h));
			}
		let lineBaseline = 0;
		if (baselineOf.size > 0) {
			lineBaseline = Math.max(...baselineOf.values());
			const below = Math.max(
				...[...baselineOf].map(([it, b]) => (it.cross ?? 0) + it.crossMargins - b),
			);
			if (!(lines.length === 1 && crossSize !== undefined))
				lineCross[li] = Math.max(lineCross[li] ?? 0, lineBaseline + below);
		}
		const lc = lineCross[li] ?? 0;
		// Main axis (§9.5): auto margins take free space first, then justify-content.
		const gaps = mainGap * Math.max(0, line.length - 1);
		let free = avail - sum(line.map((it) => it.target + it.mainMargins)) - gaps;
		const autos = sum(line.map((it) => (it.autoMainStart ? 1 : 0) + (it.autoMainEnd ? 1 : 0)));
		let start = 0;
		let between = mainGap;
		if (autos > 0 && free > 0) {
			const each = free / autos;
			for (const it of line) {
				if (it.autoMainStart) it.mainStart += each;
				if (it.autoMainEnd) it.mainEnd += each;
			}
			free = 0;
		} else if (/^(center)$/.test(justify)) start = free / 2;
		else if (/^(flex-end|end|right)$/.test(justify) !== reverse) start = free;
		else if (justify === "space-between" && line.length > 1 && free > 0)
			between += free / (line.length - 1);
		else if (justify === "space-around" && free > 0) {
			start = free / line.length / 2;
			between += free / line.length;
		} else if (justify === "space-evenly" && free > 0) {
			start = free / (line.length + 1);
			between += free / (line.length + 1);
		} else if (/^(space-around|space-evenly)$/.test(justify) && free < 0) start = free / 2;
		const ordered = reverse ? [...line].reverse() : line;
		let mainAt =
			reverse &&
			!/^(center|space-between|space-around|space-evenly)$/.test(justify) &&
			!/^(flex-end|end|right)$/.test(justify)
				? free
				: start;
		if (reverse && /^(flex-end|end|right)$/.test(justify)) mainAt = 0;
		for (const it of ordered) {
			const main = mainAt + it.mainStart;
			// Cross axis (§9.6): auto margins, then align-self.
			const outerCross = (it.cross ?? 0) + it.crossMargins;
			let cross = it.crossStart;
			const freeCross = lc - outerCross;
			if (it.autoCrossStart && it.autoCrossEnd) cross += Math.max(0, freeCross) / 2;
			else if (it.autoCrossStart) cross += Math.max(0, freeCross);
			else if (baselineOf.has(it)) cross = it.crossStart + lineBaseline - (baselineOf.get(it) ?? 0);
			else if (!it.autoCrossEnd) {
				if (it.align === "center") cross += freeCross / 2;
				else if (/^(flex-end|end|self-end)$/.test(it.align) !== (wrapValue === "wrap-reverse"))
					cross += freeCross;
			}
			const f = it.f as Fragment;
			let x = column ? crossAt + cross : main;
			let y = column ? main : crossAt + cross;
			if (it.box.type === "element") {
				const { dx, dy } = flow.relative(it.box.style, cw, ch);
				x += dx;
				y += dy;
			}
			kids.push({ f, x, y });
			for (const p of f.pending) pending.push({ ...p, x: p.x + x, y: p.y + y });
			mainAt = main + it.target + it.mainEnd + between;
		}
		crossAt += lc + crossGap;
	}
	const crossTotal = sum(lineCross) + crossGap * Math.max(0, lines.length - 1);
	return { kids, height: column ? (ch ?? contentMain) : (ch ?? crossTotal), pending };
}

/** A flex item's flex base size, hypothetical main size and limits (§9.2, §4.5). */
export function flexItem(
	flow: Flow,
	item: ElementBox | TextRun,
	column: boolean,
	cw: number,
	ch: number | undefined,
	alignItems: string,
): FlexItem {
	const base: FlexItem = {
		box: item,
		grow: 0,
		shrink: 1,
		base: 0,
		hypo: 0,
		min: 0,
		max: Number.POSITIVE_INFINITY,
		target: 0,
		frozen: false,
		mainStart: 0,
		mainEnd: 0,
		mainMargins: 0,
		crossStart: 0,
		crossMargins: 0,
		crossMin: 0,
		crossMax: Number.POSITIVE_INFINITY,
		autoMainStart: false,
		autoMainEnd: false,
		autoCrossStart: false,
		autoCrossEnd: false,
		align: "stretch",
		stretch: true,
		definiteCross: false,
	};
	if (item.type === "text") {
		const c = flow.contribution(item);
		base.shrink = 1;
		base.base = column ? flow.layout(item, { available: cw, width: cw }).h : c.max;
		base.min = column ? base.base : c.min;
		base.hypo = Math.max(base.min, base.base);
		base.align = alignItems === "normal" ? "stretch" : alignItems;
		base.stretch = /^(normal|stretch)$/.test(alignItems);
		return base;
	}
	const { style } = item;
	const bm = boxModel(flow.ctx, style, { width: cw, height: ch });
	const { main, cross } = alongAxes(bm, column);
	const m = bm.margin;
	const [ms, me, cs, ce] = column
		? (["top", "bottom", "left", "right"] as const)
		: (["left", "right", "top", "bottom"] as const);
	const it: FlexItem = {
		...base,
		edges: main.inset,
		mainStart: m[ms],
		mainEnd: m[me],
		mainMargins: m[ms] + m[me],
		crossStart: m[cs],
		crossMargins: m[cs] + m[ce],
		autoMainStart: bm.autoMargin[ms],
		autoMainEnd: bm.autoMargin[me],
		autoCrossStart: bm.autoMargin[cs],
		autoCrossEnd: bm.autoMargin[ce],
	};
	const grow = Number(value(style, "flex-grow"));
	const shrink = Number(value(style, "flex-shrink"));
	it.grow = Number.isNaN(grow) ? 0 : grow;
	it.shrink = Number.isNaN(shrink) ? 1 : shrink;
	const self = value(style, "align-self");
	it.align = self === "auto" ? (alignItems === "normal" ? "stretch" : alignItems) : self;
	const crossProp = column ? "width" : "height";
	const mainProp = column ? "height" : "width";
	const definiteCross = cross.size;
	it.definiteCross = definiteCross !== undefined;
	it.stretch =
		/^(normal|stretch)$/.test(it.align) &&
		isAuto(style, crossProp) &&
		definiteCross === undefined &&
		!it.autoCrossStart &&
		!it.autoCrossEnd;
	it.crossMin = cross.min;
	it.crossMax = cross.max;
	const mainSpec = main.size;
	/** The item's size in the main axis from its content. */
	const contentMain = (): number => {
		if (!column) return flow.contribution(item, ch).max - it.mainMargins;
		// Column: the height at the width the item will have.
		const w =
			definiteCross ??
			(it.stretch ? Math.max(0, cw - it.crossMargins) : fitWidth(flow, item, cw - it.crossMargins));
		return flow.layout(item, { available: w, width: w, pctW: cw }).h;
	};
	const basis = value(style, "flex-basis");
	const basisLength =
		basis === "auto" || basis === "content"
			? undefined
			: setSize(flow.ctx, style, bm, "flex-basis", column ? ch : cw, column ? "y" : "x");
	it.base = basisLength ?? (basis === "content" ? undefined : mainSpec) ?? contentMain();
	if (it.base === undefined || Number.isNaN(it.base)) it.base = contentMain();
	it.contentBase =
		!column && basisLength === undefined && (basis === "content" || mainSpec === undefined);
	const scroll = clipsOverflow(style, column ? "y" : "x");
	const minSpec = setSize(
		flow.ctx,
		style,
		bm,
		`min-${mainProp}`,
		column ? ch : cw,
		column ? "y" : "x",
	);
	if (minSpec !== undefined) it.min = minSpec;
	else if (isAuto(style, `min-${mainProp}`) && !scroll) {
		// The content-based minimum size (§4.5): min-content, no more than a specified size.
		// The content size suggestion: the content's min-content size, whatever the width says.
		let content = column
			? contentMain()
			: item.kind === "replaced"
				? flow.contribution(item).min - it.mainMargins
				: flow.contentSizes(item).min + main.inset;
		if (bm.ratio && definiteCross !== undefined) {
			const crossContent = Math.max(0, definiteCross - cross.inset);
			content = Math.max(
				content,
				(column ? crossContent / bm.ratio : crossContent * bm.ratio) + main.inset,
			);
		}
		// Never above the max main size (§4.5: "further clamped by the maximum main size").
		it.min = Math.min(mainSpec !== undefined ? Math.min(mainSpec, content) : content, main.max);
	}
	it.max = main.max;
	// Never below its padding and border (the content box can't be negative, §9.2).
	it.base = Math.max(it.base, main.inset);
	it.hypo = Math.max(it.min, Math.min(it.max, it.base));
	return it;
}

/** An item's hypothetical cross size at its main size (§9.4). */
export function flexCross(
	flow: Flow,
	it: FlexItem,
	column: boolean,
	cw: number,
	ch: number | undefined,
	crossSize: number | undefined,
): number {
	if (it.box.type === "text")
		return column
			? fitWidth(flow, it.box, cw)
			: flow.layout(it.box, { available: it.target, width: it.target }).h;
	const { style } = it.box;
	const bm = boxModel(flow.ctx, style, { width: cw, height: ch });
	const { main, cross } = alongAxes(bm, column);
	if (cross.size !== undefined) return cross.size;
	if (column) {
		if (it.stretch && crossSize !== undefined) return Math.max(0, crossSize - it.crossMargins);
		// fit-content (also for auto when not stretched), max-content, min-content.
		return flow.layout(it.box, { available: cw - it.crossMargins, shrink: true, pctW: cw }).w;
	}
	const ratio = bm.ratio || (it.box.kind === "replaced" ? (flow.natural(it.box).ratio ?? 0) : 0);
	if (ratio) return (it.target - main.inset) / ratio + cross.inset;
	return flow.layout(it.box, { available: it.target, width: it.target, pctW: cw }).h;
}

/** A shrink-to-fit border-box width in `avail` (fit-content). */
export function fitWidth(flow: Flow, item: ElementBox | TextRun, avail: number): number {
	return flow.layout(item, { available: avail, shrink: true }).w;
}

/** A flex item while resolving a line (css-flexbox-1 §9). */
export interface FlexItem {
	box: ElementBox | TextRun;
	grow: number;
	shrink: number;
	/** Flex base size and hypothetical main size (border box). */
	base: number;
	/** Padding + border in the main axis (shrinking is weighted by the inner base size). */
	edges?: number;
	hypo: number;
	/** Main-size limits (min: specified or the content-based minimum). */
	min: number;
	max: number;
	/** The resolved main size. */
	target: number;
	frozen: boolean;
	mainStart: number;
	mainEnd: number;
	mainMargins: number;
	crossStart: number;
	crossMargins: number;
	crossMin: number;
	crossMax: number;
	autoMainStart: boolean;
	autoMainEnd: boolean;
	autoCrossStart: boolean;
	autoCrossEnd: boolean;
	align: string;
	/** It stretches to the line's cross size. */
	stretch: boolean;
	/** Its cross size is set (width / height), not from its content. */
	definiteCross: boolean;
	/** In a row, its flex base size is its max-content width (no flex-basis or width). */
	contentBase?: boolean;
	cross?: number;
	f?: Fragment;
}

/**
 * Resolve the flexible lengths of a line (css-flexbox-1 §9.7): freeze the
 * inflexible items, then repeatedly distribute the free space by flex
 * factor (scaled by base size when shrinking) and freeze the items that hit
 * their min / max.
 */
export function resolveFlexibleLengths(line: FlexItem[], avail: number, gaps: number): void {
	const outer = (it: FlexItem, size: number) => size + it.mainMargins;
	const growing = sum(line.map((it) => outer(it, it.hypo))) + gaps < avail;
	for (const it of line) {
		const factor = growing ? it.grow : it.shrink;
		it.frozen = factor === 0 || (growing && it.base > it.hypo) || (!growing && it.base < it.hypo);
		it.target = it.frozen ? it.hypo : it.base;
	}
	const used = () => sum(line.map((it) => outer(it, it.frozen ? it.target : it.base))) + gaps;
	const initialFree = avail - used();
	for (let round = 0; round <= line.length; round++) {
		const open = line.filter((it) => !it.frozen);
		if (open.length === 0) break;
		let free = avail - used();
		const factors = sum(open.map((it) => (growing ? it.grow : it.shrink)));
		if (factors < 1) {
			const scaled = initialFree * factors;
			if (Math.abs(scaled) < Math.abs(free)) free = scaled;
		}
		for (const it of open) {
			if (free === 0) it.target = it.base;
			else if (growing) it.target = it.base + (factors > 0 ? (free * it.grow) / factors : 0);
			else {
				const inner = (o: FlexItem) => Math.max(0, o.base - (o.edges ?? 0));
				const scaled = sum(open.map((o) => o.shrink * inner(o)));
				it.target = it.base - (scaled > 0 ? (Math.abs(free) * it.shrink * inner(it)) / scaled : 0);
			}
		}
		let total = 0;
		const violation = new Map<FlexItem, number>();
		for (const it of open) {
			const clamped = Math.max(it.min, Math.min(it.max, it.target));
			violation.set(it, clamped - it.target);
			total += clamped - it.target;
			it.target = clamped;
		}
		for (const it of open)
			if (
				total === 0 ||
				(total > 0 && (violation.get(it) ?? 0) > 0) ||
				(total < 0 && (violation.get(it) ?? 0) < 0)
			)
				it.frozen = true;
	}
}

/**
 * A flex container's content sizes: a row's items side by side (a wrapping
 * row's min-content is its widest item), a column's widest item.
 */
export function flexSizes(flow: Flow, box: ElementBox, height?: number): Sizes {
	const kids = box.children.filter((c) => !flow.absolute(c));
	const each = kids.map((k) => flow.contribution(k, height));
	const largest = (key: "min" | "max") => Math.max(0, ...each.map((c) => c[key]));
	const row = !keyword(box.style, "flex-direction").startsWith("column");
	if (!row) return { min: largest("min"), max: largest("max") };
	const gap = (lengthOf(flow.ctx, box.style, "column-gap") ?? 0) * Math.max(0, kids.length - 1);
	const wrap = keyword(box.style, "flex-wrap") !== "nowrap";
	return {
		min: wrap ? largest("min") : sum(each.map((c) => c.min)) + gap,
		max: sum(each.map((c) => c.max)) + gap,
	};
}
