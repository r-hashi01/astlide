/**
 * Preset and custom shape geometry as SVG paths.
 *
 * @module
 */

import { type Element, kid, kids, num } from "../ooxml/xml";
import type { Line } from "./fills";
import { r2 } from "./html";

/** Preset / custom geometries other than rect / roundRect / ellipse, as SVG. */
export function svgGeometry(
	geom: string,
	spPr: Element | undefined,
	w: number,
	h: number,
	fill: string,
	line: Line | null,
	uid: string,
	head?: string,
	tail?: string,
): string | null {
	const p = (pts: [number, number][]) =>
		`M${pts.map(([x, y]) => `${r2(x * w)} ${r2(y * h)}`).join(" L")} Z`;
	let d: string | null = null;
	let open = false;
	switch (geom) {
		case "line":
		case "straightConnector1":
		case "bentConnector2":
		case "bentConnector3":
		case "curvedConnector3":
			d = `M0 0 L${r2(w)} ${r2(h)}`;
			open = true;
			break;
		case "triangle":
			d = p([
				[0.5, 0],
				[1, 1],
				[0, 1],
			]);
			break;
		case "rtTriangle":
			d = p([
				[0, 0],
				[1, 1],
				[0, 1],
			]);
			break;
		case "diamond":
			d = p([
				[0.5, 0],
				[1, 0.5],
				[0.5, 1],
				[0, 0.5],
			]);
			break;
		case "parallelogram":
			d = p([
				[0.25, 0],
				[1, 0],
				[0.75, 1],
				[0, 1],
			]);
			break;
		case "trapezoid":
			d = p([
				[0.25, 0],
				[0.75, 0],
				[1, 1],
				[0, 1],
			]);
			break;
		case "pentagon":
		case "homePlate":
			d = p([
				[0, 0],
				[0.8, 0],
				[1, 0.5],
				[0.8, 1],
				[0, 1],
			]);
			break;
		case "chevron":
			d = p([
				[0, 0],
				[0.8, 0],
				[1, 0.5],
				[0.8, 1],
				[0, 1],
				[0.2, 0.5],
			]);
			break;
		case "hexagon":
			d = p([
				[0.25, 0],
				[0.75, 0],
				[1, 0.5],
				[0.75, 1],
				[0.25, 1],
				[0, 0.5],
			]);
			break;
		case "octagon":
			d = p([
				[0.29, 0],
				[0.71, 0],
				[1, 0.29],
				[1, 0.71],
				[0.71, 1],
				[0.29, 1],
				[0, 0.71],
				[0, 0.29],
			]);
			break;
		case "rightArrow":
			d = p([
				[0, 0.25],
				[0.7, 0.25],
				[0.7, 0],
				[1, 0.5],
				[0.7, 1],
				[0.7, 0.75],
				[0, 0.75],
			]);
			break;
		case "leftArrow":
			d = p([
				[1, 0.25],
				[0.3, 0.25],
				[0.3, 0],
				[0, 0.5],
				[0.3, 1],
				[0.3, 0.75],
				[1, 0.75],
			]);
			break;
		case "upArrow":
			d = p([
				[0.25, 1],
				[0.25, 0.3],
				[0, 0.3],
				[0.5, 0],
				[1, 0.3],
				[0.75, 0.3],
				[0.75, 1],
			]);
			break;
		case "downArrow":
			d = p([
				[0.25, 0],
				[0.25, 0.7],
				[0, 0.7],
				[0.5, 1],
				[1, 0.7],
				[0.75, 0.7],
				[0.75, 0],
			]);
			break;
		case "star5": {
			const pts: [number, number][] = [];
			for (let i = 0; i < 10; i++) {
				const r = i % 2 ? 0.19 : 0.5;
				const a = -Math.PI / 2 + (i * Math.PI) / 5;
				pts.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]);
			}
			d = p(pts);
			break;
		}
		case "wedgeRectCallout":
		case "wedgeRoundRectCallout":
		case "wedgeEllipseCallout":
			d = calloutPath(spPr, w, h);
			break;
		case "custom":
			d = customPath(kid(spPr, "a:custGeom"), w, h);
			break;
		default:
			// Unknown presets draw as their box.
			d = p([
				[0, 0],
				[1, 0],
				[1, 1],
				[0, 1],
			]);
	}
	if (!d) return null;
	const markers: string[] = [];
	const marker = (id: string, flip: boolean) =>
		`<marker id="${id}" viewBox="0 0 10 10" refX="${flip ? 1 : 9}" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${line?.color ?? "#000"}"/></marker>`;
	if (head && head !== "none") markers.push(marker(`${uid}h`, true));
	if (tail && tail !== "none") markers.push(marker(`${uid}t`, false));
	const stroke = line
		? `stroke="${line.color}" stroke-width="${r2(line.width)}"${line.dash ? ` stroke-dasharray="${line.dash}"` : ""}`
		: 'stroke="none"';
	const ends = `${head && head !== "none" ? ` marker-start="url(#${uid}h)"` : ""}${tail && tail !== "none" ? ` marker-end="url(#${uid}t)"` : ""}`;
	// Pictures and gradients can't be SVG paints here: a box cut to the shape takes them.
	const css = !!fill && !open && /gradient|url\(/.test(fill);
	const paint = fill && !open && !css ? fill : "none";
	return (
		(css
			? `<div style="position:absolute;inset:0;background:${fill};clip-path:path('${d}')"></div>`
			: "") +
		`<svg style="position:absolute;left:0;top:0;overflow:visible" width="${r2(Math.max(w, 1))}" height="${r2(Math.max(h, 1))}">` +
		`${markers.length ? `<defs>${markers.join("")}</defs>` : ""}<path d="${d}" fill="${paint}" ${stroke}${ends}/></svg>`
	);
}

/** A named adjust value of a preset geometry (fraction), or `fallback`. */
function adjNamed(spPr: Element | undefined, name: string, fallback: number): number {
	const gd = kids(kid(kid(spPr, "a:prstGeom"), "a:avLst"), "a:gd").find(
		(g) => g.attribs.name === name,
	);
	const m = gd?.attribs.fmla?.match(/val (-?\d+)/);
	return (m ? Number(m[1]) : fallback) / 100000;
}

/**
 * Speech-bubble callouts: a rectangle with a wedge to the tip at
 * (adj1, adj2) from the center, its base on the side the tip lies past.
 */
function calloutPath(spPr: Element | undefined, w: number, h: number): string {
	const tx = (0.5 + adjNamed(spPr, "adj1", -20833)) * w;
	const ty = (0.5 + adjNamed(spPr, "adj2", 62500)) * h;
	const pt = (x: number, y: number) => `${r2(x)} ${r2(y)}`;
	const dx = (tx - w / 2) / w;
	const dy = (ty - h / 2) / h;
	const near = (v: number) => (v < 0.5 ? [1 / 6, 5 / 12] : [7 / 12, 5 / 6]);
	const tip = pt(tx, ty);
	if (Math.abs(dy) >= Math.abs(dx) && dy > 0.5) {
		const [a, b] = near(tx / w).map((f) => f * w);
		return `M${pt(0, 0)} L${pt(w, 0)} L${pt(w, h)} L${pt(b ?? 0, h)} L${tip} L${pt(a ?? 0, h)} L${pt(0, h)} Z`;
	}
	if (Math.abs(dy) >= Math.abs(dx) && dy < -0.5) {
		const [a, b] = near(tx / w).map((f) => f * w);
		return `M${pt(0, 0)} L${pt(a ?? 0, 0)} L${tip} L${pt(b ?? 0, 0)} L${pt(w, 0)} L${pt(w, h)} L${pt(0, h)} Z`;
	}
	if (dx > 0.5) {
		const [a, b] = near(ty / h).map((f) => f * h);
		return `M${pt(0, 0)} L${pt(w, 0)} L${pt(w, a ?? 0)} L${tip} L${pt(w, b ?? 0)} L${pt(w, h)} L${pt(0, h)} Z`;
	}
	if (dx < -0.5) {
		const [a, b] = near(ty / h).map((f) => f * h);
		return `M${pt(0, 0)} L${pt(w, 0)} L${pt(w, h)} L${pt(0, h)} L${pt(0, b ?? 0)} L${tip} L${pt(0, a ?? 0)} Z`;
	}
	// Tip inside the box: just the box.
	return `M${pt(0, 0)} L${pt(w, 0)} L${pt(w, h)} L${pt(0, h)} Z`;
}

function customPath(geom: Element | undefined, w: number, h: number): string | null {
	const out: string[] = [];
	for (const path of kids(kid(geom, "a:pathLst"), "a:path")) {
		const pw = num(path, "w", 1) || 1;
		const ph = num(path, "h", 1) || 1;
		const pt = (el: Element | undefined): [number, number] => [
			(num(el, "x") / pw) * w,
			(num(el, "y") / ph) * h,
		];
		let cur: [number, number] = [0, 0];
		for (const c of kids(path)) {
			const pts = kids(c, "a:pt").map(pt);
			switch (c.name) {
				case "a:moveTo":
					cur = pts[0] ?? cur;
					out.push(`M${r2(cur[0])} ${r2(cur[1])}`);
					break;
				case "a:lnTo":
					cur = pts[0] ?? cur;
					out.push(`L${r2(cur[0])} ${r2(cur[1])}`);
					break;
				case "a:cubicBezTo":
					out.push(`C${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" ")}`);
					cur = pts[2] ?? cur;
					break;
				case "a:quadBezTo":
					out.push(`Q${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" ")}`);
					cur = pts[1] ?? cur;
					break;
				case "a:arcTo": {
					const wR = (num(c, "wR") / pw) * w;
					const hR = (num(c, "hR") / ph) * h;
					const st = (num(c, "stAng") / 60000) * (Math.PI / 180);
					const sw = (num(c, "swAng") / 60000) * (Math.PI / 180);
					const cx = cur[0] - wR * Math.cos(st);
					const cy = cur[1] - hR * Math.sin(st);
					// In pieces of at most half a turn: SVG drops an arc that ends where
					// it starts (a full circle), and a half turn's end decides the side.
					const pieces = Math.max(1, Math.ceil(Math.abs(sw) / Math.PI - 1e-9));
					for (let k = 1; k <= pieces; k++) {
						const a = st + (sw * k) / pieces;
						const end: [number, number] = [cx + wR * Math.cos(a), cy + hR * Math.sin(a)];
						out.push(`A${r2(wR)} ${r2(hR)} 0 0 ${sw > 0 ? 1 : 0} ${r2(end[0])} ${r2(end[1])}`);
						cur = end;
					}
					break;
				}
				case "a:close":
					out.push("Z");
					break;
			}
		}
	}
	return out.length ? out.join(" ") : null;
}
