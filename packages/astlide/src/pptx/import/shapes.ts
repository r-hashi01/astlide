/**
 * A slide's shape tree as HTML: groups, shapes, pictures, graphic frames and
 * tables at their positions.
 *
 * @module
 */

import { colorChild, cssColor } from "../color";
import { type Element, find, kid, kids, num, path } from "../ooxml/xml";
import { fillCss, imageUrl, lineCss } from "./fills";
import { svgGeometry } from "./geometry";
import { attrEsc, line, r2 } from "./html";
import { type Placeholder, placeholderOf, sources } from "./placeholders";
import { type SlideContext, type Transform, type Xfrm, xfrmOf } from "./presentation";
import { renderText, textBody } from "./text";

/** Shapes of a tree as HTML. `placeholders`: render placeholder shapes too (the slide's own). */
export function renderTree(
	tree: Element | undefined,
	t: Transform,
	ctx: SlideContext,
	placeholders: boolean,
): string {
	let out = "";
	for (const raw of kids(tree)) {
		// Alternate content: the fallback is what other apps understand.
		const shapes =
			raw.name === "mc:AlternateContent"
				? kids(kid(raw, "mc:Fallback") ?? kids(raw, "mc:Choice")[0])
				: [raw];
		for (const s of shapes) {
			const ph = placeholderOf(s);
			if (ph && !placeholders) continue;
			switch (s.name) {
				case "p:sp":
				case "p:cxnSp":
					out += line(renderShape(s, t, ctx, ph));
					break;
				case "p:pic":
					out += line(renderPicture(s, t, ctx, ph));
					break;
				case "p:grpSp":
					out += renderGroup(s, t, ctx, placeholders);
					break;
				case "p:graphicFrame":
					out += line(renderFrame(s, t, ctx));
					break;
			}
		}
	}
	return out;
}

function renderGroup(g: Element, t: Transform, ctx: SlideContext, placeholders: boolean): string {
	const x = path(g, "p:grpSpPr", "a:xfrm");
	const xf = xfrmOf(x);
	const chOff = kid(x, "a:chOff");
	const chExt = kid(x, "a:chExt");
	if (!xf || !chOff || !chExt) return renderTree(g, t, ctx, placeholders);
	const sx = num(chExt, "cx") ? xf.w / num(chExt, "cx") : 1;
	const sy = num(chExt, "cy") ? xf.h / num(chExt, "cy") : 1;
	const inner: Transform = {
		sx: t.sx * sx,
		sy: t.sy * sy,
		tx: t.tx + t.sx * (xf.x - num(chOff, "x") * sx),
		ty: t.ty + t.sy * (xf.y - num(chOff, "y") * sy),
	};
	return renderTree(g, inner, ctx, placeholders);
}

/** Box style (position, size, rotation / flips) in px. */
function boxCss(xf: Xfrm, t: Transform, ctx: SlideContext): string {
	const s = ctx.scale;
	const tr: string[] = [];
	if (xf.rot) tr.push(`rotate(${r2(xf.rot)}deg)`);
	if (xf.flipH) tr.push("scaleX(-1)");
	if (xf.flipV) tr.push("scaleY(-1)");
	return (
		`position:absolute;left:${r2((t.tx + xf.x * t.sx) * s)}px;top:${r2((t.ty + xf.y * t.sy) * s)}px;` +
		`width:${r2(xf.w * t.sx * s)}px;height:${r2(xf.h * t.sy * s)}px;${tr.length ? `transform:${tr.join(" ")};` : ""}`
	);
}

function renderShape(
	sp: Element,
	t: Transform,
	ctx: SlideContext,
	ph: Placeholder | undefined,
): string {
	const chain = sources(ph, ctx);
	const spPr = kid(sp, "p:spPr");
	const xf =
		xfrmOf(kid(spPr, "a:xfrm")) ??
		chain
			.map((c) => xfrmOf(path(c, "p:spPr", "a:xfrm")))
			.filter(Boolean)
			.pop();
	if (!xf) return "";
	const style = kid(sp, "p:style");
	// Fill: the shape's own, else its style's fillRef color.
	let fill = fillCss(spPr, ctx, ctx.part);
	if (fill === null) {
		const ref = kid(style, "a:fillRef");
		fill = ref && num(ref, "idx") > 0 ? (cssColor(colorChild(ref), ctx.colors) ?? "") : "";
	}
	const lnRef = kid(style, "a:lnRef");
	const line = lineCss(
		kid(spPr, "a:ln"),
		ctx,
		lnRef && num(lnRef, "idx") > 0 ? colorChild(lnRef) : undefined,
	);
	const geom =
		kid(spPr, "a:prstGeom")?.attribs.prst ?? (kid(spPr, "a:custGeom") ? "custom" : "rect");
	const ln = kid(spPr, "a:ln");
	const head = kid(ln, "a:headEnd")?.attribs.type;
	const tail = kid(ln, "a:tailEnd")?.attribs.type;

	let drawing = "";
	const px = (n: number) => r2(n);
	const w = xf.w * t.sx * ctx.scale;
	const h = xf.h * t.sy * ctx.scale;
	if (geom === "rect" || geom === "roundRect" || geom === "ellipse") {
		const radius =
			geom === "ellipse"
				? "50%"
				: geom === "roundRect"
					? `${px(Math.min(w, h) * adj(spPr, 16667))}px`
					: "";
		const border = line
			? `border:${px(line.width)}px ${line.dash ? "dashed" : "solid"} ${line.color};`
			: "";
		if (fill || border)
			drawing = `<div style="position:absolute;inset:0;${fill ? `background:${fill};` : ""}${border}${radius ? `border-radius:${radius};` : ""}"></div>`;
	} else {
		const svg = svgGeometry(geom, spPr, w, h, fill ?? "", line, `m${++ctx.ids.n}`, head, tail);
		if (svg) drawing = svg;
	}
	const text = renderText(kid(sp, "p:txBody"), chain, ph, ctx);
	if (!drawing && !text) return "";
	return `<div style="${boxCss(xf, t, ctx)}">${drawing}${text}</div>`;
}

/** An adjust value of a preset geometry, as a fraction (adj 16667 → 0.16667). */
function adj(spPr: Element | undefined, fallback: number): number {
	const gd = find(path(spPr, "a:prstGeom"), "a:gd");
	const m = gd?.attribs.fmla?.match(/val (-?\d+)/);
	return (m ? Number(m[1]) : fallback) / 100000;
}

function renderPicture(
	pic: Element,
	t: Transform,
	ctx: SlideContext,
	ph: Placeholder | undefined,
): string {
	const chain = sources(ph, ctx);
	const spPr = kid(pic, "p:spPr");
	const xf =
		xfrmOf(kid(spPr, "a:xfrm")) ??
		chain
			.map((c) => xfrmOf(path(c, "p:spPr", "a:xfrm")))
			.filter(Boolean)
			.pop();
	if (!xf) return "";
	const blipFill = kid(pic, "p:blipFill");
	const url = blipFill ? imageUrl(blipFill, ctx, ctx.part) : null;
	const w = xf.w * t.sx * ctx.scale;
	const h = xf.h * t.sy * ctx.scale;
	if (!url) {
		// A format browsers can't show (EMF / WMF / TIFF …): its frame, marked.
		return `<div style="${boxCss(xf, t, ctx)}border:1px dashed #9ca3af"></div>`;
	}
	// srcRect crops the picture: scale it up and shift it inside the frame.
	const crop = kid(blipFill, "a:srcRect");
	const l = num(crop, "l") / 100000;
	const tp = num(crop, "t") / 100000;
	const rr = num(crop, "r") / 100000;
	const b = num(crop, "b") / 100000;
	const iw = w / Math.max(0.01, 1 - l - rr);
	const ih = h / Math.max(0.01, 1 - tp - b);
	const radius = kid(spPr, "a:prstGeom")?.attribs.prst === "ellipse" ? "border-radius:50%;" : "";
	const line = lineCss(kid(spPr, "a:ln"), ctx);
	const border = line ? `outline:${r2(line.width)}px solid ${line.color};` : "";
	return (
		`<div style="${boxCss(xf, t, ctx)}overflow:hidden;${radius}${border}">` +
		`<img src="${attrEsc(url)}" alt="${attrEsc(path(pic, "p:nvPicPr", "p:cNvPr")?.attribs.descr ?? "")}" style="position:absolute;left:${r2(-l * iw)}px;top:${r2(-tp * ih)}px;width:${r2(iw)}px;height:${r2(ih)}px;display:block"></div>`
	);
}

function renderFrame(frame: Element, t: Transform, ctx: SlideContext): string {
	const xf = xfrmOf(kid(frame, "p:xfrm"));
	if (!xf) return "";
	const tbl = find(frame, "a:tbl");
	if (tbl) return renderTable(tbl, xf, t, ctx);
	// Charts, SmartArt, OLE objects: their frame, marked.
	const uri = find(frame, "a:graphicData")?.attribs.uri ?? "";
	const label = /chart/.test(uri) ? "Chart" : /diagram/.test(uri) ? "SmartArt" : "Object";
	return `<div style="${boxCss(xf, t, ctx)}border:1px dashed #9ca3af;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:${r2(14)}px">${label}</div>`;
}

function renderTable(tbl: Element, xf: Xfrm, t: Transform, ctx: SlideContext): string {
	const s = ctx.scale;
	const cols = kids(kid(tbl, "a:tblGrid"), "a:gridCol").map((c) => num(c, "w") * t.sx * s);
	const rows = kids(tbl, "a:tr");
	let body = "";
	for (const tr of rows) {
		let cells = "";
		for (const tc of kids(tr, "a:tc")) {
			if (tc.attribs.hMerge === "1" || tc.attribs.vMerge === "1") continue;
			const tcPr = kid(tc, "a:tcPr");
			const span = num(tc, "gridSpan", 1);
			const rowSpan = num(tc, "rowSpan", 1);
			const m = (k: string, d: number) => r2(num(tcPr, k, d) * s);
			const css = [
				`padding:${m("marT", 45720)}px ${m("marR", 91440)}px ${m("marB", 45720)}px ${m("marL", 91440)}px`,
			];
			const fill = fillCss(tcPr, ctx, ctx.part);
			if (fill) css.push(`background:${fill}`);
			for (const [tag, side] of [
				["a:lnL", "left"],
				["a:lnR", "right"],
				["a:lnT", "top"],
				["a:lnB", "bottom"],
			] as const) {
				const line = lineCss(kid(tcPr, tag), ctx);
				if (line && kid(tcPr, tag))
					css.push(`border-${side}:${r2(line.width)}px solid ${line.color}`);
			}
			const anchor = tcPr?.attribs.anchor;
			if (anchor)
				css.push(
					`vertical-align:${anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : "top"}`,
				);
			// Cell text: its paragraphs (the cell's own margins pad them).
			const text = textBody(kid(tc, "a:txBody"), [], undefined, ctx)?.html ?? "";
			cells += `<td${span > 1 ? ` colspan="${span}"` : ""}${rowSpan > 1 ? ` rowspan="${rowSpan}"` : ""} style="${css.join(";")}">${text}</td>`;
		}
		body += `<tr style="height:${r2(num(tr, "h") * t.sy * s)}px">${cells}</tr>`;
	}
	const left = r2((t.tx + xf.x * t.sx) * s);
	const top = r2((t.ty + xf.y * t.sy) * s);
	return (
		`<table style="position:absolute;left:${left}px;top:${top}px;width:${r2(cols.reduce((a, b) => a + b, 0))}px">` +
		`<colgroup>${cols.map((w) => `<col style="width:${r2(w)}px">`).join("")}</colgroup><tbody>${body}</tbody></table>`
	);
}
