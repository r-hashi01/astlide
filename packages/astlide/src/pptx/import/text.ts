/**
 * Text: paragraph and run properties through the inheritance chain, bullets
 * and numbering, and a text body as HTML.
 *
 * @module
 */

import { colorChild, cssColor } from "../color";
import { EMU_PER_POINT } from "../ooxml/units";
import { type Element, kid, kids, num, path, textOf } from "../ooxml/xml";
import { fontStack, resolveFont, safeFontName } from "./fonts";
import { attrEsc, esc, r2 } from "./html";
import { type Placeholder, titleTypes } from "./placeholders";
import type { SlideContext } from "./presentation";

/** @internal Paragraph / run properties as they cascade (level styles → shape → paragraph → run). */
export interface TextProps {
	algn?: string;
	marL?: number;
	indent?: number;
	lnSpcPct?: number;
	lnSpcPts?: number;
	spcBefPts?: number;
	spcBefPct?: number;
	spcAftPts?: number;
	spcAftPct?: number;
	bullet?:
		| { kind: "char"; char: string; font?: string }
		| { kind: "num"; type: string; start: number }
		| { kind: "none" };
	buClr?: Element;
	buSzPct?: number;
	sz?: number;
	b?: boolean;
	i?: boolean;
	u?: boolean;
	strike?: boolean;
	color?: Element;
	font?: string;
	/** The East Asian font (`a:ea`), for the characters `font` lacks. */
	eaFont?: string;
	cap?: string;
	baseline?: number;
	spc?: number;
}

/** Apply a pPr / lvlNpPr element over `base`. */
function paraProps(base: TextProps, el: Element | undefined): TextProps {
	if (!el) return base;
	const p: TextProps = { ...base };
	const a = el.attribs;
	if (a.algn) p.algn = a.algn;
	if (a.marL !== undefined) p.marL = Number(a.marL);
	if (a.indent !== undefined) p.indent = Number(a.indent);
	const spacing = (name: string): { pct?: number; pts?: number } | null => {
		const s = kid(el, name);
		if (!s) return null;
		const pct = kid(s, "a:spcPct");
		const pts = kid(s, "a:spcPts");
		return { pct: pct ? num(pct, "val") : undefined, pts: pts ? num(pts, "val") : undefined };
	};
	const ln = spacing("a:lnSpc");
	if (ln) [p.lnSpcPct, p.lnSpcPts] = [ln.pct, ln.pts];
	const bef = spacing("a:spcBef");
	if (bef) [p.spcBefPct, p.spcBefPts] = [bef.pct, bef.pts];
	const aft = spacing("a:spcAft");
	if (aft) [p.spcAftPct, p.spcAftPts] = [aft.pct, aft.pts];
	if (kid(el, "a:buNone")) p.bullet = { kind: "none" };
	const buChar = kid(el, "a:buChar");
	if (buChar)
		p.bullet = {
			kind: "char",
			char: buChar.attribs.char ?? "•",
			font: kid(el, "a:buFont")?.attribs.typeface,
		};
	const buNum = kid(el, "a:buAutoNum");
	if (buNum)
		p.bullet = {
			kind: "num",
			type: buNum.attribs.type ?? "arabicPeriod",
			start: startAt(num(buNum, "startAt", 1)),
		};
	const buClr = kid(el, "a:buClr");
	if (buClr) p.buClr = colorChild(buClr);
	const buSz = kid(el, "a:buSzPct");
	if (buSz) p.buSzPct = num(buSz, "val") / 100000;
	return runProps(p, kid(el, "a:defRPr"));
}

/** Apply an rPr / defRPr / endParaRPr element over `base`. */
function runProps(base: TextProps, el: Element | undefined): TextProps {
	if (!el) return base;
	const p: TextProps = { ...base };
	const a = el.attribs;
	if (a.sz !== undefined) p.sz = Number(a.sz);
	if (a.b !== undefined) p.b = a.b === "1" || a.b === "true";
	if (a.i !== undefined) p.i = a.i === "1" || a.i === "true";
	if (a.u !== undefined) p.u = a.u !== "none";
	if (a.strike !== undefined) p.strike = a.strike !== "noStrike";
	if (a.cap !== undefined) p.cap = a.cap;
	if (a.baseline !== undefined) p.baseline = Number(a.baseline);
	if (a.spc !== undefined) p.spc = Number(a.spc);
	const fill = kid(el, "a:solidFill");
	if (fill) p.color = colorChild(fill);
	const latin = safeFontName(kid(el, "a:latin")?.attribs.typeface);
	const ea = safeFontName(kid(el, "a:ea")?.attribs.typeface);
	if (latin) p.font = latin;
	if (ea) p.eaFont = ea;
	return p;
}

/** A numbered list's first number, within PowerPoint's own range (1–32767). */
function startAt(n: number): number {
	return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), 32767) : 1;
}

/** Wingdings / Symbol bullet glyphs → Unicode (a null-prototype map: keys come from the file). */
const SYMBOL_BULLETS: Record<string, string> = Object.assign(Object.create(null), {
	"§": "▪",
	q: "❑",
	Ø: "➢",
	ü: "✓",
	n: "■",
	l: "●",
	v: "❖",
	"·": "•",
	o: "○",
	"": "•",
});

function autoNumber(type: string, n: number): string {
	const roman = (v: number) => {
		const map: [number, string][] = [
			[1000, "m"],
			[900, "cm"],
			[500, "d"],
			[400, "cd"],
			[100, "c"],
			[90, "xc"],
			[50, "l"],
			[40, "xl"],
			[10, "x"],
			[9, "ix"],
			[5, "v"],
			[4, "iv"],
			[1, "i"],
		];
		let out = "";
		let rest = v;
		for (const [k, s] of map)
			while (rest >= k) {
				out += s;
				rest -= k;
			}
		return out;
	};
	const alpha = (v: number) => String.fromCharCode(96 + (((v - 1) % 26) + 1));
	const body = /^alphaLc/.test(type)
		? alpha(n)
		: /^alphaUc/.test(type)
			? alpha(n).toUpperCase()
			: /^romanLc/.test(type) && n <= 3999
				? roman(n)
				: /^romanUc/.test(type) && n <= 3999
					? roman(n).toUpperCase()
					: String(n);
	if (/ParenBoth$/.test(type)) return `(${body})`;
	if (/ParenR$/.test(type)) return `${body})`;
	if (/Plain$/.test(type)) return body;
	return `${body}.`;
}

/** @internal Level styles for a shape's text: master text style → master / layout placeholder → shape. */
export function levelStyle(
	level: number,
	chain: Element[],
	ph: Placeholder | undefined,
	ctx: SlideContext,
	own: Element | undefined,
): TextProps {
	const lvl = `a:lvl${level + 1}pPr`;
	let props: TextProps = {};
	props = paraProps(props, kid(ctx.defaultStyle, lvl));
	// Titles use the master's title style, content placeholders its body style; text
	// boxes and the date / footer / slide-number placeholders its "other" style.
	const master =
		!ph || /^(dt|ftr|sldNum|hdr)$/.test(ph.type)
			? ctx.masterStyles.other
			: titleTypes.has(ph.type)
				? ctx.masterStyles.title
				: ctx.masterStyles.body;
	props = paraProps(props, kid(master, lvl));
	for (const c of chain) props = paraProps(props, kid(path(c, "p:txBody", "a:lstStyle"), lvl));
	props = paraProps(props, kid(kid(own, "a:lstStyle"), lvl));
	return props;
}

export function renderText(
	txBody: Element | undefined,
	chain: Element[],
	ph: Placeholder | undefined,
	ctx: SlideContext,
): string {
	const t = textBody(txBody, chain, ph, ctx);
	if (!t) return "";
	return `<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:${t.anchor};padding:${t.padding};">${t.wrap ? t.html : t.html.replace(/<p style="/g, '<p style="white-space:pre;')}</div>`;
}

/** A text body's paragraphs as HTML, with its insets / anchoring / wrapping. */
export function textBody(
	txBody: Element | undefined,
	chain: Element[],
	ph: Placeholder | undefined,
	ctx: SlideContext,
): { html: string; padding: string; anchor: string; wrap: boolean } | null {
	if (!txBody) return null;
	const paras = kids(txBody, "a:p");
	if (
		!paras.some((p) =>
			kids(p).some((r) => r.name === "a:r" || r.name === "a:fld" || r.name === "a:br"),
		)
	)
		return null;
	// Body properties: master → layout → shape.
	const bodyPrs = [...chain.map((c) => path(c, "p:txBody", "a:bodyPr")), kid(txBody, "a:bodyPr")];
	const body: Record<string, string> = {};
	let fontScale = 1;
	let spacingCut = 0;
	for (const b of bodyPrs) {
		if (!b) continue;
		Object.assign(body, b.attribs);
		const auto = kid(b, "a:normAutofit");
		if (auto) {
			fontScale = num(auto, "fontScale", 100000) / 100000;
			spacingCut = num(auto, "lnSpcReduction") / 100000;
		}
	}
	const s = ctx.scale;
	const ins = (k: string, d: number) => r2(Number(body[k] ?? d) * s);
	const anchor = body.anchor === "ctr" ? "center" : body.anchor === "b" ? "flex-end" : "flex-start";
	const wrap = body.wrap !== "none";
	const counters = new Map<number, number>();
	const ptPx = EMU_PER_POINT * s; // px per point

	let html = "";
	for (const p of paras) {
		// Some generators write a second pPr mid-paragraph; the last one wins (as in LibreOffice).
		const pPr = kids(p, "a:pPr").pop();
		const level = num(pPr, "lvl");
		let props = levelStyle(level, chain, ph, ctx, txBody);
		props = paraProps(props, pPr);
		const runs = kids(p).filter((r) => r.name === "a:r" || r.name === "a:fld" || r.name === "a:br");
		const firstRun = runProps(
			props,
			kid(
				runs.find((r) => r.name !== "a:br"),
				"a:rPr",
			) ?? kid(p, "a:endParaRPr"),
		);
		const size = ((firstRun.sz ?? 1800) / 100) * ptPx * fontScale;
		const lnPct =
			props.lnSpcPct !== undefined ? (props.lnSpcPct / 100000) * (1 - spacingCut) : 1 - spacingCut;
		const lineHeight =
			props.lnSpcPts !== undefined
				? `${r2((props.lnSpcPts / 100) * ptPx)}px`
				: String(r2(lnPct * 1.2));
		const spc = (pts?: number, pct?: number) =>
			pts !== undefined ? (pts / 100) * ptPx : pct !== undefined ? (pct / 100000) * size * 1.2 : 0;
		const css = [
			`text-align:${props.algn === "ctr" ? "center" : props.algn === "r" ? "right" : props.algn === "just" || props.algn === "dist" ? "justify" : "left"}`,
			`font-size:${r2(size)}px`,
			`line-height:${lineHeight}`,
			props.marL ? `padding-left:${r2(props.marL * s)}px` : "",
			props.indent ? `text-indent:${r2(props.indent * s)}px` : "",
			spc(props.spcBefPts, props.spcBefPct)
				? `margin-top:${r2(spc(props.spcBefPts, props.spcBefPct))}px`
				: "",
			spc(props.spcAftPts, props.spcAftPct)
				? `margin-bottom:${r2(spc(props.spcAftPts, props.spcAftPct))}px`
				: "",
		].filter(Boolean);

		let bullet = "";
		const hasText = runs.some((r) => r.name !== "a:br" && textOf(kid(r, "a:t")) !== "");
		// A paragraph ends the numbering of the levels below it (1. A, a. x, 2. B, a. y).
		if (hasText) for (const l of [...counters.keys()]) if (l > level) counters.delete(l);
		if (hasText && props.bullet && props.bullet.kind !== "none") {
			let mark: string;
			if (props.bullet.kind === "num") {
				const n = (counters.get(level) ?? props.bullet.start - 1) + 1;
				counters.set(level, n);
				mark = autoNumber(props.bullet.type, n);
			} else {
				const font = props.bullet.font ?? "";
				mark = /wingdings|symbol/i.test(font)
					? (SYMBOL_BULLETS[props.bullet.char] ?? "•")
					: props.bullet.char;
			}
			const color = cssColor(props.buClr ?? firstRun.color, ctx.colors);
			const width = props.indent && props.indent < 0 ? -props.indent * s : size;
			bullet = `<span style="display:inline-block;text-indent:0;width:${r2(width)}px;${color ? `color:${color};` : ""}${props.buSzPct ? `font-size:${r2(props.buSzPct * 100)}%;` : ""}">${esc(mark)}</span>`;
		} else counters.delete(level);

		let content = "";
		for (const r of runs) {
			if (r.name === "a:br") {
				content += "<br>";
				continue;
			}
			const rp = runProps(props, kid(r, "a:rPr"));
			let text = textOf(kid(r, "a:t"));
			if (r.name === "a:fld" && /slidenum/i.test(r.attribs.type ?? ""))
				text = String(ctx.slideNumber);
			if (!text) continue;
			const rcss: string[] = [];
			if (rp.sz !== undefined && rp.sz !== firstRun.sz)
				rcss.push(`font-size:${r2((rp.sz / 100) * ptPx * fontScale)}px`);
			const face = resolveFont(rp.font, ctx.fonts);
			const ea = resolveFont(rp.eaFont, ctx.fonts);
			if (face || ea) rcss.push(`font-family:${fontStack(face, ea)}`);
			if (rp.b) rcss.push("font-weight:700");
			if (rp.i) rcss.push("font-style:italic");
			const deco = [rp.u ? "underline" : "", rp.strike ? "line-through" : ""]
				.filter(Boolean)
				.join(" ");
			if (deco) rcss.push(`text-decoration:${deco}`);
			const color = cssColor(rp.color, ctx.colors);
			if (color) rcss.push(`color:${color}`);
			if (rp.cap === "all") rcss.push("text-transform:uppercase");
			else if (rp.cap === "small") rcss.push("font-variant:small-caps");
			if (rp.spc) rcss.push(`letter-spacing:${r2((rp.spc / 100) * ptPx)}px`);
			if (rp.baseline)
				rcss.push(`vertical-align:${rp.baseline > 0 ? "super" : "sub"};font-size:70%`);
			const highlight = kid(kid(r, "a:rPr"), "a:highlight");
			const marker = highlight ? cssColor(colorChild(highlight), ctx.colors) : null;
			if (marker) rcss.push(`background:${marker}`);
			let span = `<span${rcss.length ? ` style="${rcss.join(";")}"` : ""}>${esc(text).replace(/\t/g, "&emsp;")}</span>`;
			const link = kid(kid(r, "a:rPr"), "a:hlinkClick")?.attribs["r:id"];
			const target = link ? ctx.pkg.rels(ctx.part).get(link) : undefined;
			if (target?.external && /^(https?:|mailto:)/i.test(target.target))
				span = `<a href="${attrEsc(target.target)}" target="_blank" rel="noopener">${span}</a>`;
			content += span;
		}
		html += `\n<p style="${css.join(";")}">${bullet}${content || "<br>"}</p>`;
	}
	return {
		html,
		padding: `${ins("tIns", 45720)}px ${ins("rIns", 91440)}px ${ins("bIns", 45720)}px ${ins("lIns", 91440)}px`,
		anchor,
		wrap,
	};
}

/** Text of paragraphs (for titles / notes). */
export function paragraphsText(txBody: Element | undefined): string {
	return kids(txBody, "a:p")
		.map((p) =>
			kids(p)
				.map((r) =>
					r.name === "a:br"
						? "\n"
						: r.name === "a:r" || r.name === "a:fld"
							? textOf(kid(r, "a:t"))
							: "",
				)
				.join(""),
		)
		.join("\n");
}
