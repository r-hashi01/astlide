/**
 * CSS `transform`, the part that keeps boxes as boxes: translations and
 * scales (and `matrix()` without rotation or skew). Rotations and skews are
 * left out — a rotated box isn't a rectangle on the slide any more.
 */

/** `p' = (sx · x + tx, sy · y + ty)`. */
export interface Affine {
	sx: number;
	sy: number;
	tx: number;
	ty: number;
}

export const IDENTITY: Affine = { sx: 1, sy: 1, tx: 0, ty: 0 };

/** `outer ∘ inner`: apply `inner`, then `outer`. */
export function compose(outer: Affine, inner: Affine): Affine {
	return {
		sx: outer.sx * inner.sx,
		sy: outer.sy * inner.sy,
		tx: outer.sx * inner.tx + outer.tx,
		ty: outer.sy * inner.ty + outer.ty,
	};
}

export function mapRect<R extends { x: number; y: number; w: number; h: number }>(
	a: Affine,
	r: R,
): R {
	return { ...r, x: a.sx * r.x + a.tx, y: a.sy * r.y + a.ty, w: a.sx * r.w, h: a.sy * r.h };
}

const args = (inner: string) => inner.split(/\s*,\s*|\s+/).filter(Boolean);
const number = (v: string | undefined, fallback: number) => {
	const n = Number.parseFloat(v ?? "");
	return Number.isNaN(n) ? fallback : n;
};
const angle = (v: string | undefined) => number(v, 0);

/**
 * A box's transform, about its `transform-origin`, for a border box at
 * (`x`, `y`) of size `w` × `h`. `length` resolves a length (percentages:
 * pass the basis). Null when it's the identity or not a plain
 * translate / scale.
 */
export function boxTransform(
	transform: string,
	origin: string,
	box: { x: number; y: number; w: number; h: number },
	length: (v: string, basis: number) => number,
): Affine | null {
	const value = transform.trim();
	if (!value || value === "none") return null;
	let m = IDENTITY;
	for (const [, name = "", inner = ""] of value.matchAll(/([a-zA-Z0-9]+)\(([^)]*)\)/g)) {
		const a = args(inner);
		const len = (v: string | undefined, basis: number) => {
			const n = length(v ?? "0", basis);
			return Number.isNaN(n) ? 0 : n;
		};
		let step: Affine | null = IDENTITY;
		switch (name) {
			case "translate":
				step = { sx: 1, sy: 1, tx: len(a[0], box.w), ty: len(a[1], box.h) };
				break;
			case "translateX":
				step = { sx: 1, sy: 1, tx: len(a[0], box.w), ty: 0 };
				break;
			case "translateY":
				step = { sx: 1, sy: 1, tx: 0, ty: len(a[0], box.h) };
				break;
			case "scale": {
				const sx = number(a[0], 1);
				step = { sx, sy: number(a[1], sx), tx: 0, ty: 0 };
				break;
			}
			case "scaleX":
				step = { sx: number(a[0], 1), sy: 1, tx: 0, ty: 0 };
				break;
			case "scaleY":
				step = { sx: 1, sy: number(a[0], 1), tx: 0, ty: 0 };
				break;
			case "matrix": {
				const [ma, mb, mc, md, me, mf] = a.map((v) => number(v, 0));
				step = mb || mc ? null : { sx: ma ?? 1, sy: md ?? 1, tx: me ?? 0, ty: mf ?? 0 };
				break;
			}
			case "translateZ":
			case "scaleZ":
			case "perspective":
				break;
			case "rotate":
			case "rotateZ":
			case "skew":
			case "skewX":
			case "skewY":
				if (a.some((v) => angle(v) !== 0)) step = null;
				break;
			case "rotateX":
			case "rotateY":
				if (angle(a[0]) !== 0) step = null;
				break;
			default:
				step = null;
		}
		if (!step) return null;
		m = compose(m, step);
	}
	if (m.sx === 1 && m.sy === 1 && m.tx === 0 && m.ty === 0) return null;
	// About the origin: move it to 0, transform, move it back.
	const [ox, oy] = transformOrigin(origin, box, length);
	return compose({ sx: 1, sy: 1, tx: ox, ty: oy }, compose(m, { sx: 1, sy: 1, tx: -ox, ty: -oy }));
}

/** `transform-origin` as an absolute point (default: the box's center). */
function transformOrigin(
	origin: string,
	box: { x: number; y: number; w: number; h: number },
	length: (v: string, basis: number) => number,
): [number, number] {
	const keyword: Record<string, string> = {
		left: "0%",
		top: "0%",
		center: "50%",
		right: "100%",
		bottom: "100%",
	};
	let [h = "50%", v = "50%"] = args(origin.trim() || "50% 50%");
	// "top left" etc.: vertical keyword first.
	if (/^(top|bottom)$/.test(h) || /^(left|right)$/.test(v)) [h, v] = [v, h];
	const at = (value: string, size: number) => {
		const n = length(keyword[value] ?? value, size);
		return Number.isNaN(n) ? size / 2 : n;
	};
	return [box.x + at(h, box.w), box.y + at(v, box.h)];
}
