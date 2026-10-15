/**
 * Inline SVG → native PowerPoint shapes, for simple drawings such as boxes
 * and arrows: rect, circle, ellipse, line, polyline, polygon, path (curves
 * flattened into segments), text, and arrow markers. Anything else
 * (gradients, arcs, `<use>`, images, filters …) makes the converter give up,
 * and the exporter places the SVG as a picture instead.
 *
 * @module
 */

import type { ShapeSpec, SlideElement, StrokeSpec, TextBoxSpec } from "./ooxml-writer";

/** Minimal DOM shape (domhandler) of the parsed markup. */
export interface SvgNode {
	type: string;
	name?: string;
	attribs?: Record<string, string>;
	children?: SvgNode[];
	data?: string;
}

export interface SvgBox {
	/** Slide px. */
	x: number;
	y: number;
	w: number;
	h: number;
	/** `currentColor`, `RRGGBB`. */
	color: string;
	/** Inherited text font: PowerPoint face name and size in px. */
	fontFace: string;
	fontSize: number;
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (m: Matrix, n: Matrix): Matrix => [
	m[0] * n[0] + m[2] * n[1],
	m[1] * n[0] + m[3] * n[1],
	m[0] * n[2] + m[2] * n[3],
	m[1] * n[2] + m[3] * n[3],
	m[0] * n[4] + m[2] * n[5] + m[4],
	m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [
	m[0] * x + m[2] * y + m[4],
	m[1] * x + m[3] * y + m[5],
];

class Unsupported extends Error {}

function transformOf(value: string | undefined): Matrix {
	let m = IDENTITY;
	for (const [, fn, args = ""] of (value ?? "").matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
		const a = args
			.split(/[\s,]+/)
			.filter(Boolean)
			.map(Number);
		const [p = 0, q, r, s, t, u] = a;
		let n: Matrix;
		if (fn === "translate") n = [1, 0, 0, 1, p, q ?? 0];
		else if (fn === "scale") n = [p, 0, 0, q ?? p, 0, 0];
		else if (fn === "matrix" && a.length === 6) n = [p, q ?? 0, r ?? 0, s ?? 1, t ?? 0, u ?? 0];
		else if (fn === "rotate") {
			const rad = (p * Math.PI) / 180;
			const [cx = 0, cy = 0] = [q, r];
			n = multiply(
				multiply(
					[1, 0, 0, 1, cx, cy],
					[Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0],
				),
				[1, 0, 0, 1, -cx, -cy],
			);
		} else throw new Unsupported(`transform ${fn}`);
		m = multiply(m, n);
	}
	return m;
}

const NAMED: Record<string, string> = {
	black: "000000",
	white: "FFFFFF",
	red: "FF0000",
	green: "008000",
	blue: "0000FF",
	gray: "808080",
	grey: "808080",
	orange: "FFA500",
	yellow: "FFFF00",
	purple: "800080",
};

/** A paint value as `RRGGBB` + opacity, `null` for none; gradients / patterns are unsupported. */
function paint(value: string, current: string): { hex: string; alpha: number } | null {
	const v = value.trim().toLowerCase();
	if (v === "none" || v === "transparent") return null;
	if (v === "currentcolor") return { hex: current, alpha: 1 };
	if (v.startsWith("url(")) throw new Unsupported("paint server");
	const named = NAMED[v];
	if (named) return { hex: named, alpha: 1 };
	const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
	if (hex) {
		const h = hex[1] ?? "";
		return {
			hex: (h.length === 3 ? [...h].map((c) => c + c).join("") : h).toUpperCase(),
			alpha: 1,
		};
	}
	const rgb = v.match(/^rgba?\(([^)]+)\)$/);
	if (rgb) {
		const [r = 0, g = 0, b = 0, a = 1] = (rgb[1] ?? "").split(/[\s,/]+/).map(Number);
		return {
			hex: [r, g, b]
				.map((c) => Math.round(c).toString(16).padStart(2, "0"))
				.join("")
				.toUpperCase(),
			alpha: a,
		};
	}
	throw new Unsupported(`color ${v}`);
}

/** Presentation attributes and `style` declarations, inherited down the tree. */
type Props = Record<string, string>;
const INHERITED = [
	"fill",
	"stroke",
	"stroke-width",
	"stroke-dasharray",
	"fill-opacity",
	"stroke-opacity",
	"font-size",
	"font-family",
	"font-weight",
	"text-anchor",
	"color",
];

function propsOf(node: SvgNode, parent: Props): Props {
	const own: Props = {};
	const a = node.attribs ?? {};
	for (const [k, v] of Object.entries(a)) own[k] = v;
	for (const decl of (a.style ?? "").split(";")) {
		const i = decl.indexOf(":");
		if (i > 0) own[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
	}
	const out: Props = {};
	for (const k of INHERITED) {
		const v = own[k] ?? parent[k];
		if (v !== undefined) out[k] = v;
	}
	for (const k of ["opacity", "marker-start", "marker-end", "transform"]) {
		const v = own[k];
		if (v !== undefined) out[k] = v;
	}
	out.__opacity = String(Number(parent.__opacity ?? 1) * Number(own.opacity ?? 1));
	return out;
}

/** Path data → subpaths of points (curves flattened); arcs are unsupported. */
function parsePath(d: string): { points: [number, number][]; closed: boolean }[] {
	const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
	const out: { points: [number, number][]; closed: boolean }[] = [];
	let cur: [number, number][] = [];
	let x = 0;
	let y = 0;
	let sx = 0;
	let sy = 0;
	let cmd = "";
	let last: [number, number] | null = null; // last control point (S / T)
	let i = 0;
	const num = () => Number(tokens[i++]);
	const flush = (closed: boolean) => {
		if (cur.length > 1) out.push({ points: cur, closed });
		cur = [];
	};
	const bezier = (pts: [number, number][]) => {
		for (let s = 1; s <= 8; s++) {
			const t = s / 8;
			const n = pts.length - 1;
			let p = pts.map((q) => [...q] as [number, number]);
			for (let r = 0; r < n; r++)
				p = p.slice(0, -1).map((q, j) => {
					const nq = p[j + 1] ?? q;
					return [q[0] + (nq[0] - q[0]) * t, q[1] + (nq[1] - q[1]) * t];
				});
			const [first] = p;
			if (first) cur.push(first);
		}
	};
	while (i < tokens.length) {
		const tok = tokens[i] ?? "";
		if (/[a-zA-Z]/.test(tok)) {
			cmd = tok;
			i++;
			if (cmd === "Z" || cmd === "z") {
				x = sx;
				y = sy;
				flush(true);
				continue;
			}
		}
		const rel = cmd === cmd.toLowerCase();
		const ox = rel ? x : 0;
		const oy = rel ? y : 0;
		switch (cmd.toUpperCase()) {
			case "M":
				flush(false);
				x = ox + num();
				y = oy + num();
				sx = x;
				sy = y;
				cur.push([x, y]);
				cmd = rel ? "l" : "L";
				last = null;
				break;
			case "L":
				x = ox + num();
				y = oy + num();
				cur.push([x, y]);
				last = null;
				break;
			case "H":
				x = ox + num();
				cur.push([x, y]);
				last = null;
				break;
			case "V":
				y = oy + num();
				cur.push([x, y]);
				last = null;
				break;
			case "C": {
				const c1: [number, number] = [ox + num(), oy + num()];
				const c2: [number, number] = [ox + num(), oy + num()];
				const e: [number, number] = [ox + num(), oy + num()];
				bezier([[x, y], c1, c2, e]);
				[x, y] = e;
				last = c2;
				break;
			}
			case "S": {
				const c1: [number, number] = last ? [2 * x - last[0], 2 * y - last[1]] : [x, y];
				const c2: [number, number] = [ox + num(), oy + num()];
				const e: [number, number] = [ox + num(), oy + num()];
				bezier([[x, y], c1, c2, e]);
				[x, y] = e;
				last = c2;
				break;
			}
			case "Q": {
				const c: [number, number] = [ox + num(), oy + num()];
				const e: [number, number] = [ox + num(), oy + num()];
				bezier([[x, y], c, e]);
				[x, y] = e;
				last = c;
				break;
			}
			case "T": {
				const c: [number, number] = last ? [2 * x - last[0], 2 * y - last[1]] : [x, y];
				const e: [number, number] = [ox + num(), oy + num()];
				bezier([[x, y], c, e]);
				[x, y] = e;
				last = c;
				break;
			}
			default:
				throw new Unsupported(`path command ${cmd}`);
		}
	}
	flush(false);
	return out;
}

const textOf = (n: SvgNode): string =>
	n.type === "text" ? (n.data ?? "") : (n.children ?? []).map(textOf).join("");

/**
 * The drawing as slide elements (inches, via `k` inches per px), or `null`
 * when it uses something PowerPoint shapes can't express here.
 */
export function svgToShapes(root: SvgNode, box: SvgBox, k: number): SlideElement[] | null {
	try {
		const a = root.attribs ?? {};
		const view = (a.viewBox ?? a.viewbox ?? "")
			.split(/[\s,]+/)
			.filter(Boolean)
			.map(Number);
		const [vx = 0, vy = 0, vw = box.w, vh = box.h] = view.length === 4 ? view : [];
		// preserveAspectRatio: xMidYMid meet (the default).
		const scale = Math.min(box.w / (vw || 1), box.h / (vh || 1));
		const base: Matrix = [
			scale,
			0,
			0,
			scale,
			box.x + (box.w - vw * scale) / 2 - vx * scale,
			box.y + (box.h - vh * scale) / 2 - vy * scale,
		];
		const markers = new Set<string>();
		const out: SlideElement[] = [];
		const walk = (node: SvgNode, m: Matrix, parent: Props) => {
			if (node.type !== "tag") return;
			const name = (node.name ?? "").toLowerCase();
			if (["title", "desc", "metadata", "style"].includes(name)) return;
			if (name === "defs") {
				for (const c of node.children ?? []) {
					if (c.type !== "tag") continue;
					if ((c.name ?? "").toLowerCase() !== "marker") throw new Unsupported(`defs ${c.name}`);
					if (c.attribs?.id) markers.add(c.attribs.id);
				}
				return;
			}
			if (name === "marker") {
				if (node.attribs?.id) markers.add(node.attribs.id);
				return;
			}
			const p = propsOf(node, parent);
			const mm = multiply(m, transformOf(p.transform));
			if (name === "g" || (name === "svg" && node === root)) {
				for (const c of node.children ?? []) walk(c, mm, p);
				return;
			}
			draw(name, node, mm, p);
		};
		const draw = (name: string, node: SvgNode, m: Matrix, p: Props) => {
			const at = node.attribs ?? {};
			const n = (key: string, d = 0) => {
				const v = Number.parseFloat(at[key] ?? "");
				return Number.isNaN(v) ? d : v;
			};
			const opacity = Number(p.__opacity ?? 1);
			const fillPaint = paint(p.fill ?? "black", box.color);
			const strokePaint = paint(p.stroke ?? "none", box.color);
			const unit = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])); // px per user unit
			const fill = fillPaint
				? {
						fill: fillPaint.hex,
						fillTransparency: Math.round(
							(1 - fillPaint.alpha * Number(p["fill-opacity"] ?? 1) * opacity) * 100,
						),
					}
				: {};
			const arrow = (v: string | undefined) =>
				!!v && markers.has(v.replace(/^url\(#?|\)$/g, "").replace(/^#/, ""));
			const stroke: StrokeSpec | undefined = strokePaint
				? {
						color: strokePaint.hex,
						width: Number.parseFloat(p["stroke-width"] ?? "1") * unit * k * 72,
						transparency: Math.round(
							(1 - strokePaint.alpha * Number(p["stroke-opacity"] ?? 1) * opacity) * 100,
						),
						dashed: !!p["stroke-dasharray"] && p["stroke-dasharray"] !== "none",
						head: arrow(p["marker-start"]),
						tail: arrow(p["marker-end"]),
					}
				: undefined;
			const freeform = (
				paths: { points: [number, number][]; closed: boolean }[],
				closedFill: boolean,
			) => {
				const pts = paths.map((q) => ({
					closed: q.closed,
					points: q.points.map(([px, py]) => apply(m, px, py)),
				}));
				const all = pts.flatMap((q) => q.points);
				if (all.length === 0) return;
				const minX = Math.min(...all.map((q) => q[0]));
				const minY = Math.min(...all.map((q) => q[1]));
				const maxX = Math.max(...all.map((q) => q[0]));
				const maxY = Math.max(...all.map((q) => q[1]));
				const shape: ShapeSpec = {
					type: "shape",
					x: minX * k,
					y: minY * k,
					w: (maxX - minX) * k,
					h: (maxY - minY) * k,
					geom: {
						paths: pts.map((q) => ({
							closed: q.closed,
							points: q.points.map(
								([px, py]) => [(px - minX) * k, (py - minY) * k] as [number, number],
							),
						})),
					},
					...(closedFill ? fill : {}),
					stroke,
				};
				out.push(shape);
			};
			const rotated = Math.abs(m[1]) > 1e-6 || Math.abs(m[2]) > 1e-6;
			switch (name) {
				case "rect": {
					const [x, y, w, h] = [n("x"), n("y"), n("width"), n("height")];
					const rx = n("rx", n("ry"));
					if (rotated) {
						if (rx) throw new Unsupported("rotated rounded rect");
						freeform(
							[
								{
									closed: true,
									points: [
										[x, y],
										[x + w, y],
										[x + w, y + h],
										[x, y + h],
									],
								},
							],
							true,
						);
						return;
					}
					const [x0, y0] = apply(m, x, y);
					out.push({
						type: "rect",
						x: x0 * k,
						y: y0 * k,
						w: w * m[0] * k,
						h: h * m[3] * k,
						fill: fill.fill ?? "FFFFFF",
						noFill: !fill.fill,
						fillTransparency: fill.fillTransparency,
						line: stroke
							? { color: stroke.color, width: stroke.width, transparency: stroke.transparency }
							: undefined,
						radius: rx ? rx * unit * k : undefined,
					});
					return;
				}
				case "circle":
				case "ellipse": {
					if (rotated) throw new Unsupported("rotated ellipse");
					const rx = name === "circle" ? n("r") : n("rx");
					const ry = name === "circle" ? n("r") : n("ry");
					const [cx, cy] = apply(m, n("cx"), n("cy"));
					out.push({
						type: "shape",
						geom: "ellipse",
						x: (cx - rx * m[0]) * k,
						y: (cy - ry * m[3]) * k,
						w: 2 * rx * m[0] * k,
						h: 2 * ry * m[3] * k,
						...fill,
						stroke,
					});
					return;
				}
				case "line":
					freeform(
						[
							{
								closed: false,
								points: [
									[n("x1"), n("y1")],
									[n("x2"), n("y2")],
								],
							},
						],
						false,
					);
					return;
				case "polyline":
				case "polygon": {
					const nums = (at.points ?? "")
						.split(/[\s,]+/)
						.filter(Boolean)
						.map(Number);
					const points: [number, number][] = [];
					for (let j = 0; j + 1 < nums.length; j += 2)
						points.push([nums[j] ?? 0, nums[j + 1] ?? 0]);
					freeform([{ closed: name === "polygon", points }], name === "polygon");
					return;
				}
				case "path":
					freeform(parsePath(at.d ?? ""), true);
					return;
				case "text": {
					const text = textOf(node).trim();
					if (!text || !fillPaint) return;
					if (rotated) throw new Unsupported("rotated text");
					const size = (Number.parseFloat(p["font-size"] ?? "") || box.fontSize / unit) * unit;
					const [tx, ty] = apply(m, n("x"), n("y"));
					const anchor = p["text-anchor"] ?? "start";
					// The box spans the line at its baseline; PowerPoint aligns within it.
					const w = text.length * size * 0.7 + size;
					const left = anchor === "middle" ? tx - w / 2 : anchor === "end" ? tx - w : tx;
					const tb: TextBoxSpec = {
						type: "textbox",
						runs: [
							{
								text,
								options: {
									fontSize: size * k * 72,
									color: fillPaint.hex,
									fontFace: box.fontFace,
									bold: /bold|[6-9]00/.test(p["font-weight"] ?? ""),
								},
							},
						],
						x: left * k,
						y: (ty - size * 0.95) * k,
						w: w * k,
						h: size * 1.25 * k,
						align: anchor === "middle" ? "center" : anchor === "end" ? "right" : "left",
						valign: "top",
						wrap: false,
						inset: 0,
					};
					out.push(tb);
					return;
				}
				default:
					throw new Unsupported(name);
			}
		};
		walk(root, base, { color: box.color });
		return out;
	} catch (error) {
		if (error instanceof Unsupported) return null;
		throw error;
	}
}
