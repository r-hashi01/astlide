/**
 * Fills, lines, pictures and backgrounds as CSS.
 *
 * @module
 */

import { colorChild, colorOf, cssColor } from "../color";
import { EMU_PER_POINT } from "../ooxml/units";
import { type Element, kid, kids, num, path } from "../ooxml/xml";
import { r2 } from "./html";
import { type SlideContext, schemeEl } from "./presentation";

/** CSS `background` for a fill element (spPr / bgPr), or "" for none. */
export function fillCss(spPr: Element | undefined, ctx: SlideContext, part: string): string | null {
	if (!spPr) return null;
	if (kid(spPr, "a:noFill")) return "";
	const solid = kid(spPr, "a:solidFill");
	if (solid) return cssColor(colorChild(solid), ctx.colors) ?? "";
	const grad = kid(spPr, "a:gradFill");
	if (grad) {
		const stops = kids(kid(grad, "a:gsLst"), "a:gs")
			.map((gs) => ({ pos: num(gs, "pos") / 1000, color: cssColor(colorChild(gs), ctx.colors) }))
			.filter((s) => s.color)
			.sort((a, b) => a.pos - b.pos)
			.map((s) => `${s.color} ${r2(s.pos)}%`)
			.join(", ");
		if (!stops) return "";
		if (kid(grad, "a:path")) return `radial-gradient(circle, ${stops})`;
		const ang = num(kid(grad, "a:lin"), "ang") / 60000;
		return `linear-gradient(${r2(ang + 90)}deg, ${stops})`;
	}
	const patt = kid(spPr, "a:pattFill");
	if (patt) return patternCss(patt, ctx);
	const blip = kid(spPr, "a:blipFill");
	if (blip) {
		const url = imageUrl(blip, ctx, part);
		if (!url) return "";
		const css = `url('${url.replace(/'/g, "%27")}')`;
		// Tiled: the picture at its own size (96 dpi, scaled by sx / sy), repeated.
		const tile = kid(blip, "a:tile");
		const size = tile ? imageSize(blip, ctx, part) : null;
		if (tile && size) {
			const w = size.w * 9525 * ctx.scale * (num(tile, "sx", 100000) / 100000);
			const h = size.h * 9525 * ctx.scale * (num(tile, "sy", 100000) / 100000);
			return `${css} 0 0 / ${r2(w)}px ${r2(h)}px repeat`;
		}
		return `${css} center / 100% 100% no-repeat`;
	}
	return null;
}

/**
 * A pattern fill: line patterns (horizontal / vertical / diagonal, grids) as
 * repeating gradients over the background color; dotted and percentage
 * patterns as the colors mixed by coverage.
 */
function patternCss(patt: Element, ctx: SlideContext): string {
	const fg = colorOf(colorChild(kid(patt, "a:fgClr")), ctx.colors) ?? { hex: "000000", alpha: 1 };
	const bg = colorOf(colorChild(kid(patt, "a:bgClr")), ctx.colors) ?? { hex: "ffffff", alpha: 1 };
	const prst = patt.attribs.prst ?? "pct50";
	const css = (c: { hex: string; alpha: number }) =>
		`#${c.hex}${
			c.alpha < 1
				? Math.round(c.alpha * 255)
						.toString(16)
						.padStart(2, "0")
				: ""
		}`;
	const lines = (deg: number, gap: number) =>
		`repeating-linear-gradient(${deg}deg, ${css(fg)} 0 1px, transparent 1px ${gap}px)`;
	const big = /^(lg|wd|dk)/.test(prst) ? 8 : 4;
	const layers: string[] = [];
	if (/horz|grid|cross/i.test(prst) && !/diag/i.test(prst)) layers.push(lines(0, big));
	if (/vert|grid|cross/i.test(prst) && !/diag/i.test(prst)) layers.push(lines(90, big));
	if (/dndiag|diagcross/i.test(prst)) layers.push(lines(45, big));
	if (/updiag|diagcross/i.test(prst)) layers.push(lines(-45, big));
	if (layers.length) return `${layers.join(", ")}, ${css(bg)}`;
	// Dots / percentages: the average color.
	const pct = Number(prst.match(/pct(\d+)/)?.[1] ?? 50) / 100;
	const mix = [0, 2, 4]
		.map((i) => {
			const a = Number.parseInt(fg.hex.slice(i, i + 2), 16);
			const b = Number.parseInt(bg.hex.slice(i, i + 2), 16);
			return Math.round(a * pct + b * (1 - pct))
				.toString(16)
				.padStart(2, "0");
		})
		.join("");
	return `#${mix}`;
}

/** Pixel size of a fill's picture (PNG, JPEG, GIF), or null. */
function imageSize(
	blipFill: Element,
	ctx: SlideContext,
	part: string,
): { w: number; h: number } | null {
	const id = kid(blipFill, "a:blip")?.attribs["r:embed"];
	const rel = id ? ctx.pkg.rels(part).get(id) : undefined;
	const b = rel && !rel.external ? ctx.pkg.files.get(rel.target) : undefined;
	if (!b || b.length < 24) return null;
	if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
	if (b.toString("latin1", 0, 3) === "GIF") return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
	if (b[0] === 0xff && b[1] === 0xd8) {
		for (let i = 2; i + 9 < b.length; ) {
			if (b[i] !== 0xff) return null;
			const marker = b[i + 1] ?? 0;
			if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
				return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
			i += 2 + b.readUInt16BE(i + 2);
		}
	}
	return null;
}

export function imageUrl(blipFill: Element, ctx: SlideContext, part: string): string | null {
	const id = kid(blipFill, "a:blip")?.attribs["r:embed"];
	const rel = id ? ctx.pkg.rels(part).get(id) : undefined;
	return rel && !rel.external ? ctx.media(rel.target) : null;
}

export function backgroundCss(
	chain: [Element | undefined, string | undefined][],
	ctx: SlideContext,
): string {
	for (const [el, part] of chain) {
		const bg = path(el, "p:cSld", "p:bg");
		if (!bg) continue;
		const bgPr = kid(bg, "p:bgPr");
		if (bgPr) {
			// A picture background's relationship is in the part that defines it.
			const css = fillCss(bgPr, ctx, part ?? ctx.part);
			if (css) return `background:${css};`;
		}
		const ref = kid(bg, "p:bgRef");
		if (ref) {
			const c = cssColor(colorChild(ref), ctx.colors);
			if (c) return `background:${c};`;
		}
	}
	return `background:${cssColor(schemeEl("bg1"), ctx.colors) ?? "#fff"};`;
}

export function lineCss(
	ln: Element | undefined,
	ctx: SlideContext,
	styleColor?: Element,
): Line | null {
	if (ln && kid(ln, "a:noFill")) return null;
	const fill = kid(ln, "a:solidFill");
	const color = fill
		? cssColor(colorChild(fill), ctx.colors)
		: styleColor
			? cssColor(styleColor, ctx.colors)
			: null;
	if (!color) return null;
	const width = Math.max(0.5, num(ln, "w", EMU_PER_POINT) * ctx.scale);
	// Dashes as an SVG dash array: preset patterns (in line widths) or custom ones.
	let pattern: number[] | undefined;
	const custom = kids(kid(ln, "a:custDash"), "a:ds");
	if (custom.length)
		pattern = custom.flatMap((ds) => [num(ds, "d") / 100000, num(ds, "sp") / 100000]);
	else {
		const preset = kid(ln, "a:prstDash")?.attribs.val ?? "solid";
		pattern = Object.hasOwn(DASHES, preset) ? DASHES[preset] : undefined;
	}
	const dash = pattern?.length ? pattern.map((v) => r2(Math.max(0.5, v * width))).join(" ") : null;
	return { width, color, dash };
}

export interface Line {
	width: number;
	color: string;
	/** SVG stroke-dasharray, or null for a solid line. */
	dash: string | null;
}

/** Preset dashes, in multiples of the line width. */
const DASHES: Record<string, number[]> = {
	dash: [4, 3],
	sysDash: [3, 1],
	lgDash: [8, 3],
	dot: [1, 3],
	sysDot: [1, 1],
	dashDot: [4, 3, 1, 3],
	sysDashDot: [3, 1, 1, 1],
	lgDashDot: [8, 3, 1, 3],
	lgDashDotDot: [8, 3, 1, 3, 1, 3],
	sysDashDotDot: [3, 1, 1, 1, 1, 1],
};
