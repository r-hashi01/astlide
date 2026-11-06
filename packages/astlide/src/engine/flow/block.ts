/**
 * Block flow (CSS 2 §10.3.3, §10.6.3): children stacked, with margin collapsing (§8.3.1).
 */

import { marginsOf, type Sides } from "../box-model";
import type { ElementBox } from "../box-tree";
import { isAuto, isFloat } from "../properties";

import type { Flow, Placed, Sizes } from "./index";
import { join } from "./util";

export function layoutBlock(
	flow: Flow,
	box: ElementBox,
	cw: number,
	ch: number | undefined,
	m: Sides,
	padding: Sides,
	border: Sides,
	fixedHeight: boolean,
): { kids: Placed[]; height: number; mt: number; mb: number; pending: Placed[] } {
	const kids: Placed[] = [];
	const pending: Placed[] = [];
	let y = 0;
	/** The bottom margin of the last block, not yet added (it may collapse with the next). */
	let carried: number | null = null;
	let mt = m.top;
	let mb = m.bottom;
	const throughTop = !box.bfcRoot && padding.top + border.top === 0;
	const throughBottom = !box.bfcRoot && padding.bottom + border.bottom === 0 && !fixedHeight;
	let first = true;
	for (const child of box.children) {
		if (flow.absolute(child)) {
			// Its static position: where it would start in flow.
			pending.push({
				f: flow.layout(child, { available: cw, pctW: cw, pctH: ch, shrink: true }),
				x: 0,
				y: y + (carried ?? 0),
			});
			continue;
		}
		if (child.type === "text") {
			y += carried ?? 0;
			carried = null;
			const f = flow.layout(child, { available: cw, width: cw, pctW: cw, pctH: ch });
			kids.push({ f, x: 0, y });
			y += f.h;
			first = false;
			continue;
		}
		const cs = child.style;
		const shrink = isFloat(cs);
		const f = flow.layout(child, { available: cw, pctW: cw, pctH: ch, shrink });
		const cm = marginsOf(flow.ctx, cs, cw);
		let x = cm.left;
		const free = cw - f.w - cm.left - cm.right;
		if (isAuto(cs, "margin-left") && isAuto(cs, "margin-right")) x = Math.max(0, free) / 2;
		else if (isAuto(cs, "margin-left")) x = Math.max(0, free) + cm.left;
		if (first && throughTop) {
			// The first child's top margin collapses with this box's.
			mt = join(mt, f.mt);
		} else y += join(carried ?? 0, f.mt);
		carried = null;
		const { dx, dy } = flow.relative(cs, cw, ch);
		kids.push({ f, x: x + dx, y: y + dy });
		for (const p of f.pending) pending.push({ ...p, x: p.x + x + dx, y: p.y + y + dy });
		y += f.h;
		carried = f.mb;
		first = false;
	}
	if (carried !== null) {
		if (throughBottom && !first) mb = join(mb, carried);
		else y += carried;
	}
	return { kids, height: y, mt, mb, pending };
}

/** A block container's content sizes: its widest child. */
export function blockSizes(flow: Flow, box: ElementBox): Sizes {
	const each = box.children.filter((c) => !flow.absolute(c)).map((k) => flow.contribution(k));
	return {
		min: Math.max(0, ...each.map((c) => c.min)),
		max: Math.max(0, ...each.map((c) => c.max)),
	};
}
