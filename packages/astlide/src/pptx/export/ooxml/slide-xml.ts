/**
 * A slide's XML (`ppt/slides/slideN.xml`) and its relationships, from a SlideSpec.
 *
 * @module
 */

import type {
	CellBorder,
	GradientSpec,
	ImageSpec,
	RectSpec,
	ShapeSpec,
	SlideSpec,
	TableSpec,
	TextBoxSpec,
	TextRun,
	TextRunOptions,
} from "./spec";
import { emu, esc, hpt } from "./units";

const ALIGN_MAP: Record<string, string> = {
	left: "l",
	center: "ctr",
	right: "r",
};
const VALIGN_MAP: Record<string, string> = {
	top: "t",
	middle: "ctr",
	bottom: "b",
};

interface HyperlinkEntry {
	rId: string;
	url: string;
}

export function buildSlideXml(
	spec: SlideSpec,
	slideIdx: number,
): { xml: string; hyperlinks: HyperlinkEntry[]; images: SlideImage[] } {
	const hyperlinks: HyperlinkEntry[] = [];
	const images: SlideImage[] = [];
	let linkCounter = 0;

	const bgXml = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${spec.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;

	let shapeId = 2;
	const shapes: string[] = [];

	for (const el of spec.elements) {
		if (el.type === "rect") {
			shapes.push(buildRectXml(el, shapeId++));
		} else if (el.type === "image") {
			const rId = `rIdImg${images.length + 1}`;
			images.push({ rId, data: el.data, ext: el.format === "jpeg" ? "jpeg" : "png" });
			let linkRId: string | undefined;
			if (el.link) {
				linkCounter++;
				linkRId = `rId${linkCounter}`;
				hyperlinks.push({ rId: linkRId, url: el.link });
			}
			shapes.push(buildPictureXml(el, shapeId++, rId, linkRId));
		} else if (el.type === "shape") {
			shapes.push(buildShapeXml(el, shapeId++));
		} else if (el.type === "table") {
			const nextRId = () => {
				linkCounter++;
				return `rId${linkCounter}`;
			};
			shapes.push(buildTableXml(el, shapeId++, nextRId, hyperlinks));
		} else {
			shapes.push(
				buildTextBoxXml(
					el,
					shapeId++,
					() => {
						linkCounter++;
						const rId = `rId${linkCounter}`;
						return rId;
					},
					hyperlinks,
				),
			);
		}
	}

	const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld name="Slide ${slideIdx}">${bgXml}
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
${shapes.join("\n")}
</p:spTree>
</p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;

	return { xml, hyperlinks, images };
}

interface SlideImage {
	rId: string;
	data: Buffer;
	ext: "png" | "jpeg";
}

function srcRectXml(c: ImageSpec["crop"]): string {
	if (!c) return "";
	const v = (f: number) => Math.round(f * 100000);
	return `<a:srcRect l="${v(c.left)}" t="${v(c.top)}" r="${v(c.right)}" b="${v(c.bottom)}"/>`;
}

function gradFillXml(g: GradientSpec): string {
	const stops = g.stops
		.map((s) => {
			const alpha =
				s.transparency && s.transparency > 0
					? `<a:alpha val="${Math.round((100 - s.transparency) * 1000)}"/>`
					: "";
			return `<a:gs pos="${Math.round(Math.min(1, Math.max(0, s.pos)) * 100000)}"><a:srgbClr val="${s.color}">${alpha}</a:srgbClr></a:gs>`;
		})
		.join("");
	// DrawingML: 0 = left → right, clockwise; CSS: 0deg = to top.
	const ang = ((((g.angle - 90) % 360) + 360) % 360) * 60000;
	return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:lin ang="${Math.round(ang)}" scaled="0"/></a:gradFill>`;
}

function buildPictureXml(img: ImageSpec, id: number, rId: string, linkRId?: string): string {
	const name = esc(img.name ?? `Picture ${id}`);
	const link = linkRId ? `<a:hlinkClick r:id="${linkRId}"/>` : "";
	return `<p:pic>
<p:nvPicPr><p:cNvPr id="${id}" name="${name}">${link}</p:cNvPr><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="${rId}"/>${srcRectXml(img.crop)}<a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr><a:xfrm><a:off x="${emu(img.x)}" y="${emu(img.y)}"/><a:ext cx="${emu(img.w)}" cy="${emu(img.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
</p:pic>`;
}

function buildRectXml(r: RectSpec, id: number): string {
	let fillXml = `<a:solidFill><a:srgbClr val="${r.fill}"`;
	if (r.fillTransparency && r.fillTransparency > 0) {
		const alpha = Math.round((100 - r.fillTransparency) * 1000);
		fillXml += `><a:alpha val="${alpha}"/></a:srgbClr>`;
	} else {
		fillXml += "/>";
	}
	fillXml += "</a:solidFill>";
	if (r.noFill) fillXml = "<a:noFill/>";
	if (r.gradient) fillXml = gradFillXml(r.gradient);
	if (r.pattern) {
		const a = r.pattern.transparency
			? `<a:alpha val="${Math.round((100 - r.pattern.transparency) * 1000)}"/>`
			: "";
		// The background is see-through: the lines go over whatever is below.
		fillXml = `<a:pattFill prst="${r.pattern.preset}"><a:fgClr><a:srgbClr val="${r.pattern.color}">${a}</a:srgbClr></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"><a:alpha val="0"/></a:srgbClr></a:bgClr></a:pattFill>`;
	}

	let lineXml = "<a:ln><a:noFill/></a:ln>";
	if (r.line) {
		const w = r.line.width ? ` w="${Math.round(r.line.width * 12700)}"` : "";
		const a =
			r.line.transparency && r.line.transparency > 0
				? `<a:alpha val="${Math.round((100 - r.line.transparency) * 1000)}"/>`
				: "";
		lineXml = `<a:ln${w}><a:solidFill><a:srgbClr val="${r.line.color}">${a}</a:srgbClr></a:solidFill></a:ln>`;
	}
	// Rounded corners: adj is the radius as a fraction of the shorter side (max 50 000).
	const geom = r.radius
		? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.min(50000, Math.round((r.radius / Math.max(0.0001, Math.min(r.w, r.h))) * 100000))}"/></a:avLst></a:prstGeom>`
		: `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`;

	return `<p:sp>
<p:nvSpPr><p:cNvPr id="${id}" name="Rect ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr>
<a:xfrm><a:off x="${emu(r.x)}" y="${emu(r.y)}"/><a:ext cx="${emu(r.w)}" cy="${emu(r.h)}"/></a:xfrm>
${geom}
${fillXml}${lineXml}
</p:spPr>
</p:sp>`;
}

function solidFillXml(color: string, transparency?: number): string {
	const alpha =
		transparency && transparency > 0
			? `<a:alpha val="${Math.round((100 - transparency) * 1000)}"/>`
			: "";
	return `<a:solidFill><a:srgbClr val="${color}">${alpha}</a:srgbClr></a:solidFill>`;
}

function buildShapeXml(s: ShapeSpec, id: number): string {
	const W = Math.max(1, emu(s.w));
	const H = Math.max(1, emu(s.h));
	let geom: string;
	if (s.geom === "ellipse") geom = `<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>`;
	else {
		const paths = s.geom.paths
			.map((p) => {
				const [first, ...rest] = p.points;
				if (!first) return "";
				const pt = ([x, y]: [number, number]) => `<a:pt x="${emu(x)}" y="${emu(y)}"/>`;
				const body =
					`<a:moveTo>${pt(first)}</a:moveTo>` +
					rest.map((q) => `<a:lnTo>${pt(q)}</a:lnTo>`).join("") +
					(p.closed ? "<a:close/>" : "");
				return `<a:path w="${W}" h="${H}"${p.closed && s.fill ? "" : ' fill="none"'}>${body}</a:path>`;
			})
			.join("");
		geom = `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>${paths}</a:pathLst></a:custGeom>`;
	}
	const fill = s.fill ? solidFillXml(s.fill, s.fillTransparency) : "<a:noFill/>";
	const st = s.stroke;
	const line = st
		? `<a:ln w="${Math.round(st.width * 12700)}" cap="rnd">${solidFillXml(st.color, st.transparency)}${
				st.dashed ? '<a:prstDash val="dash"/>' : ""
			}<a:round/>${st.head ? '<a:headEnd type="triangle" w="med" len="med"/>' : ""}${
				st.tail ? '<a:tailEnd type="triangle" w="med" len="med"/>' : ""
			}</a:ln>`
		: "<a:ln><a:noFill/></a:ln>";
	return `<p:sp>
<p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr>
<a:xfrm><a:off x="${emu(s.x)}" y="${emu(s.y)}"/><a:ext cx="${W}" cy="${H}"/></a:xfrm>
${geom}
${fill}${line}
</p:spPr>
</p:sp>`;
}

function cellLineXml(tag: string, b: CellBorder | undefined): string {
	if (!b || b.width <= 0) return `<a:${tag} w="0"><a:noFill/></a:${tag}>`;
	const alpha =
		b.transparency !== undefined && b.transparency > 0
			? `<a:alpha val="${Math.round((100 - b.transparency) * 1000)}"/>`
			: "";
	return `<a:${tag} w="${emu(b.width / 72)}" cmpd="sng"><a:solidFill><a:srgbClr val="${b.color}">${alpha}</a:srgbClr></a:solidFill><a:prstDash val="solid"/></a:${tag}>`;
}

/** A native table (`a:tbl` in a graphic frame). */
function buildTableXml(
	t: TableSpec,
	id: number,
	nextRId: () => string,
	hyperlinks: HyperlinkEntry[],
): string {
	const grid = t.columns.map((w) => `<a:gridCol w="${emu(w)}"/>`).join("");
	const rows = t.rows
		.map((row) => {
			const cells = row.cells
				.map((c) => {
					const paras = splitIntoParagraphs(c.runs).map((p) =>
						buildParagraphXml(p, "l", nextRId, hyperlinks),
					);
					if (paras.length === 0) paras.push(`<a:p><a:endParaRPr lang="en-US"/></a:p>`);
					const m = c.margins;
					const marg = m
						? ` marL="${emu(m.left)}" marR="${emu(m.right)}" marT="${emu(m.top)}" marB="${emu(m.bottom)}"`
						: "";
					const anchor = VALIGN_MAP[c.valign ?? "middle"] ?? "ctr";
					const fill = c.fill
						? `<a:solidFill><a:srgbClr val="${c.fill}">${
								c.fillTransparency
									? `<a:alpha val="${Math.round((100 - c.fillTransparency) * 1000)}"/>`
									: ""
							}</a:srgbClr></a:solidFill>`
						: "<a:noFill/>";
					const b = c.borders ?? {};
					const tcPr = `<a:tcPr${marg} anchor="${anchor}">${cellLineXml("lnL", b.left)}${cellLineXml("lnR", b.right)}${cellLineXml("lnT", b.top)}${cellLineXml("lnB", b.bottom)}${fill}</a:tcPr>`;
					const attrs = `${c.span && c.span > 1 ? ` gridSpan="${c.span}"` : ""}${c.merged ? ' hMerge="1"' : ""}`;
					return `<a:tc${attrs}><a:txBody><a:bodyPr/><a:lstStyle/>${paras.join("")}</a:txBody>${tcPr}</a:tc>`;
				})
				.join("");
			return `<a:tr h="${emu(row.h)}">${cells}</a:tr>`;
		})
		.join("");
	return `<p:graphicFrame>
<p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>
<p:xfrm><a:off x="${emu(t.x)}" y="${emu(t.y)}"/><a:ext cx="${emu(t.w)}" cy="${emu(t.h)}"/></p:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid>${grid}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic>
</p:graphicFrame>`;
}

function buildTextBoxXml(
	tb: TextBoxSpec,
	id: number,
	nextRId: () => string,
	hyperlinks: HyperlinkEntry[],
): string {
	const anchor = VALIGN_MAP[tb.valign ?? "top"] ?? "t";
	const autoFit = tb.shrinkText ? "<a:normAutofit/>" : "<a:noAutofit/>";
	const wrapAttr = tb.wrap !== false ? 'wrap="square"' : 'wrap="none"';
	const insetAttr =
		tb.inset === undefined
			? ""
			: ["lIns", "tIns", "rIns", "bIns"].map((k) => ` ${k}="${emu(tb.inset ?? 0)}"`).join("");

	// Split flat TextRun[] into paragraphs (on breakLine boundaries)
	const paragraphs = splitIntoParagraphs(tb.runs);
	const defaultAlign = ALIGN_MAP[tb.align ?? "left"] ?? "l";

	const paraXmls: string[] = [];
	for (const para of paragraphs) {
		paraXmls.push(buildParagraphXml(para, defaultAlign, nextRId, hyperlinks));
	}

	if (paraXmls.length === 0) {
		paraXmls.push(`<a:p><a:endParaRPr lang="en-US"/></a:p>`);
	}

	return `<p:sp>
<p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
<p:spPr>
<a:xfrm><a:off x="${emu(tb.x)}" y="${emu(tb.y)}"/><a:ext cx="${emu(tb.w)}" cy="${emu(tb.h)}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
<a:noFill/>
</p:spPr>
<p:txBody>
<a:bodyPr ${wrapAttr}${insetAttr} rtlCol="0" anchor="${anchor}">${autoFit}</a:bodyPr>
<a:lstStyle/>
${paraXmls.join("\n")}
</p:txBody>
</p:sp>`;
}

// ---------------------------------------------------------------------------
// Paragraph splitting and XML generation
// ---------------------------------------------------------------------------

interface ParagraphGroup {
	runs: TextRun[];
	/** Properties from the run that had breakLine=true (paragraph-level props) */
	paraSpaceAfter?: number;
	lineSpacing?: number;
	bullet?: TextRunOptions["bullet"];
	indentLevel?: number;
	align?: string;
}

function splitIntoParagraphs(runs: TextRun[]): ParagraphGroup[] {
	const paragraphs: ParagraphGroup[] = [];
	let current: TextRun[] = [];

	for (const run of runs) {
		const opts = run.options;
		current.push(run);

		if (opts?.breakLine) {
			paragraphs.push({
				runs: current,
				paraSpaceAfter: opts.paraSpaceAfter,
				lineSpacing: opts.lineSpacing,
				bullet: opts.bullet,
				indentLevel: opts.indentLevel,
				align: opts.align,
			});
			current = [];
		}
	}

	// Remaining runs without a breakLine terminator
	if (current.length > 0) {
		paragraphs.push({ runs: current });
	}

	return paragraphs;
}

function buildParagraphXml(
	para: ParagraphGroup,
	defaultAlign: string,
	nextRId: () => string,
	hyperlinks: HyperlinkEntry[],
): string {
	const align = ALIGN_MAP[para.align ?? ""] ?? defaultAlign;

	// Build <a:pPr> attributes
	const pPrParts: string[] = [`algn="${align}"`];

	if (para.indentLevel && para.indentLevel > 0) {
		pPrParts.push(`lvl="${para.indentLevel}"`);
	}

	// Bullet indent
	if (para.bullet) {
		const indent =
			typeof para.bullet === "object" && "indent" in para.bullet ? (para.bullet.indent ?? 15) : 15;
		const indentLevel = para.indentLevel ?? 0;
		const marL = (indent + indentLevel * 20) * 12700;
		pPrParts.push(`marL="${marL}" indent="-228600"`);
	}

	let pPrInner = "";
	if (para.lineSpacing !== undefined) {
		pPrInner += `<a:lnSpc><a:spcPts val="${hpt(para.lineSpacing)}"/></a:lnSpc>`;
	}
	if (para.paraSpaceAfter !== undefined) {
		pPrInner += `<a:spcAft><a:spcPts val="${hpt(para.paraSpaceAfter)}"/></a:spcAft>`;
	}

	// Bullet marker
	if (para.bullet) {
		const isNumbered =
			typeof para.bullet === "object" && "type" in para.bullet && para.bullet.type === "number";
		pPrInner += isNumbered
			? '<a:buAutoNum type="arabicPeriod"/>'
			: '<a:buFont typeface="Arial"/><a:buChar char="&#x2022;"/>';
	}

	const pPr =
		pPrInner.length > 0
			? `<a:pPr ${pPrParts.join(" ")}>${pPrInner}</a:pPr>`
			: `<a:pPr ${pPrParts.join(" ")}/>`;

	// Build runs
	const runXmls: string[] = [];
	for (const run of para.runs) {
		const o = run.options ?? {};
		const text = run.text;
		if (!text && !o.breakLine) continue;

		const rPrParts: string[] = [`lang="${langOf(text)}"`, 'dirty="0"'];
		// PowerPoint's range is 1–4000 pt (out of range: a repair prompt).
		if (o.fontSize) rPrParts.push(`sz="${Math.min(400000, Math.max(100, hpt(o.fontSize)))}"`);
		if (o.bold) rPrParts.push('b="1"');
		if (o.italic) rPrParts.push('i="1"');
		if (o.underline) rPrParts.push('u="sng"');
		if (o.strike) rPrParts.push('strike="sngStrike"');
		if (o.letterSpacing) rPrParts.push(`spc="${hpt(o.letterSpacing)}"`);

		let rPrInner = "";
		if (o.color) {
			rPrInner += `<a:solidFill><a:srgbClr val="${o.color}"/></a:solidFill>`;
		}
		if (o.highlight) {
			rPrInner += `<a:highlight><a:srgbClr val="${o.highlight}"/></a:highlight>`;
		}
		if (o.fontFace) {
			const ea = o.eaFontFace ? `<a:ea typeface="${esc(o.eaFontFace)}"/>` : "";
			rPrInner += `<a:latin typeface="${esc(o.fontFace)}"/>${ea}<a:cs typeface="${esc(o.fontFace)}"/>`;
		}
		if (o.hyperlink?.url) {
			const rId = nextRId();
			hyperlinks.push({ rId, url: o.hyperlink.url });
			rPrInner += `<a:hlinkClick r:id="${rId}"/>`;
		}

		const rPr =
			rPrInner.length > 0
				? `<a:rPr ${rPrParts.join(" ")}>${rPrInner}</a:rPr>`
				: `<a:rPr ${rPrParts.join(" ")}/>`;

		runXmls.push(`<a:r>${rPr}<a:t>${esc(text)}</a:t></a:r>`);
	}

	if (runXmls.length === 0) {
		return `<a:p>${pPr}<a:endParaRPr lang="en-US"/></a:p>`;
	}

	return `<a:p>${pPr}${runXmls.join("")}</a:p>`;
}

/** Japanese / Korean / Chinese characters (kana, hangul, CJK ideographs, fullwidth forms). */
const KANA = /[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f]/;
const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/** The language of a run, for spelling / line breaking: Japanese, Korean, else English. */
export function langOf(text: string): string {
	if (KANA.test(text)) return "ja-JP";
	if (HANGUL.test(text)) return "ko-KR";
	if (HAN.test(text)) return "ja-JP";
	return "en-US";
}

// ---------------------------------------------------------------------------
// Slide .rels builder
// ---------------------------------------------------------------------------

export function buildSlideRels(
	hyperlinks: HyperlinkEntry[],
	images: { rId: string; target: string }[] = [],
	notesTarget?: string,
): string {
	const rels = [
		'<Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>',
	];
	if (notesTarget)
		rels.push(
			`<Relationship Id="rIdNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="${notesTarget}"/>`,
		);
	for (const h of hyperlinks) {
		rels.push(
			`<Relationship Id="${h.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(h.url)}" TargetMode="External"/>`,
		);
	}
	for (const img of images) {
		rels.push(
			`<Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${img.target}"/>`,
		);
	}
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels.join("\n")}
</Relationships>`;
}
