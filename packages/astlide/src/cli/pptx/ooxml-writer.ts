/**
 * Minimal PPTX (OOXML) writer — zero external dependencies.
 *
 * Generates a valid .pptx file (ZIP of OOXML XML) using only Node.js built-ins
 * (`zlib` for deflate, `Buffer` for binary).
 *
 * Usage:
 *   const pptx = new PptxFile({ title: "...", author: "..." });
 *   pptx.addSlide(slideSpec);
 *   await pptx.save("./output.pptx");
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { deflateRawSync } from "node:zlib";
import type { ThemeColors } from "./theme-map";

// ═══════════════════════════════════════════════════════════════════════════
// Public types — SlideSpec IR (consumed by hast-builder, produced for writer)
// ═══════════════════════════════════════════════════════════════════════════

export interface TextRunOptions {
	fontSize?: number;
	color?: string;
	fontFace?: string;
	bold?: boolean;
	italic?: boolean;
	align?: "left" | "center" | "right";
	hyperlink?: { url: string };
	breakLine?: boolean;
	bullet?: boolean | { type: "number"; indent?: number } | { indent?: number };
	indentLevel?: number;
	paraSpaceAfter?: number;
}

export interface TextRun {
	text: string;
	options?: TextRunOptions;
}

export interface TextBoxSpec {
	type: "textbox";
	runs: TextRun[];
	x: number;
	y: number;
	w: number;
	h: number;
	align?: "left" | "center" | "right";
	valign?: "top" | "middle" | "bottom";
	wrap?: boolean;
	shrinkText?: boolean;
}

export interface RectSpec {
	type: "rect";
	x: number;
	y: number;
	w: number;
	h: number;
	fill: string;
	fillTransparency?: number;
	line?: { color: string; transparency?: number };
}

export type SlideElement = TextBoxSpec | RectSpec;

export interface SlideSpec {
	background: string;
	backgroundPath?: string;
	elements: SlideElement[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Unit helpers
// ═══════════════════════════════════════════════════════════════════════════

/** @internal */
export function emu(inches: number): number {
	return Math.round(inches * 914400);
}

/** @internal */
export function hpt(pt: number): number {
	return Math.round(pt * 100);
}

/** @internal */
export function esc(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

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

// ═══════════════════════════════════════════════════════════════════════════
// Slide XML builder
// ═══════════════════════════════════════════════════════════════════════════

interface HyperlinkEntry {
	rId: string;
	url: string;
}

function buildSlideXml(
	spec: SlideSpec,
	slideIdx: number,
): { xml: string; hyperlinks: HyperlinkEntry[] } {
	const hyperlinks: HyperlinkEntry[] = [];
	let linkCounter = 0;

	const bgXml = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${spec.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;

	let shapeId = 2;
	const shapes: string[] = [];

	for (const el of spec.elements) {
		if (el.type === "rect") {
			shapes.push(buildRectXml(el, shapeId++));
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
</p:sld>`;

	return { xml, hyperlinks };
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

	let lineXml = "<a:ln><a:noFill/></a:ln>";
	if (r.line) {
		lineXml = `<a:ln><a:solidFill><a:srgbClr val="${r.line.color}"/></a:solidFill></a:ln>`;
	}

	return `<p:sp>
<p:nvSpPr><p:cNvPr id="${id}" name="Rect ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr>
<a:xfrm><a:off x="${emu(r.x)}" y="${emu(r.y)}"/><a:ext cx="${emu(r.w)}" cy="${emu(r.h)}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
${fillXml}${lineXml}
</p:spPr>
</p:sp>`;
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
<a:bodyPr ${wrapAttr} rtlCol="0" anchor="${anchor}">${autoFit}</a:bodyPr>
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

		const rPrParts: string[] = ['lang="en-US"', 'dirty="0"'];
		if (o.fontSize) rPrParts.push(`sz="${hpt(o.fontSize)}"`);
		if (o.bold) rPrParts.push('b="1"');
		if (o.italic) rPrParts.push('i="1"');

		let rPrInner = "";
		if (o.color) {
			rPrInner += `<a:solidFill><a:srgbClr val="${o.color}"/></a:solidFill>`;
		}
		if (o.fontFace) {
			rPrInner += `<a:latin typeface="${esc(o.fontFace)}"/><a:cs typeface="${esc(o.fontFace)}"/>`;
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

// ---------------------------------------------------------------------------
// Slide .rels builder
// ---------------------------------------------------------------------------

function buildSlideRels(hyperlinks: HyperlinkEntry[]): string {
	const rels = [
		'<Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>',
	];
	for (const h of hyperlinks) {
		rels.push(
			`<Relationship Id="${h.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(h.url)}" TargetMode="External"/>`,
		);
	}
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels.join("\n")}
</Relationships>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// OOXML boilerplate XML templates
// ═══════════════════════════════════════════════════════════════════════════

const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function contentTypesXml(slideCount: number): string {
	const overrides: string[] = [];
	for (let i = 1; i <= slideCount; i++) {
		overrides.push(
			`<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
		);
	}
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
${overrides.join("\n")}
</Types>`;
}

function rootRelsXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function presentationRelsXml(slideCount: number): string {
	const rels = [
		`<Relationship Id="rIdSm1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
		`<Relationship Id="rIdTheme1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`,
	];
	for (let i = 1; i <= slideCount; i++) {
		rels.push(
			`<Relationship Id="rIdSlide${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`,
		);
	}
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels.join("\n")}
</Relationships>`;
}

function presentationXml(slideCount: number): string {
	const sldIds: string[] = [];
	for (let i = 1; i <= slideCount; i++) {
		sldIds.push(`<p:sldId id="${255 + i}" r:id="rIdSlide${i}"/>`);
	}
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdSm1"/></p:sldMasterIdLst>
<p:sldIdLst>${sldIds.join("")}</p:sldIdLst>
<p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>
<p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
}

function slideMasterXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">
<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdLo1"/></p:sldLayoutIdLst>
</p:sldMaster>`;
}

function slideMasterRelsXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdLo1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;
}

function slideLayoutXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1">
<p:cSld name="Blank"><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>
</p:sldLayout>`;
}

function slideLayoutRelsXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdSm" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;
}

function themeXml(theme: ThemeColors): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="${NS_A}" name="Astlide">
<a:themeElements>
<a:clrScheme name="Astlide">
<a:dk1><a:srgbClr val="${theme.fg}"/></a:dk1>
<a:lt1><a:srgbClr val="${theme.bg}"/></a:lt1>
<a:dk2><a:srgbClr val="${theme.fg}"/></a:dk2>
<a:lt2><a:srgbClr val="${theme.muted}"/></a:lt2>
<a:accent1><a:srgbClr val="${theme.primary}"/></a:accent1>
<a:accent2><a:srgbClr val="${theme.accent}"/></a:accent2>
<a:accent3><a:srgbClr val="${theme.secondary}"/></a:accent3>
<a:accent4><a:srgbClr val="${theme.primary}"/></a:accent4>
<a:accent5><a:srgbClr val="${theme.accent}"/></a:accent5>
<a:accent6><a:srgbClr val="${theme.secondary}"/></a:accent6>
<a:hlink><a:srgbClr val="${theme.primary}"/></a:hlink>
<a:folHlink><a:srgbClr val="${theme.secondary}"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="Astlide">
<a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
</a:fontScheme>
<a:fmtScheme name="Astlide">
<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
</a:fmtScheme>
</a:themeElements>
</a:theme>`;
}

function corePropsXml(title: string, author: string): string {
	const now = new Date().toISOString();
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(title)}</dc:title>
<dc:creator>${esc(author)}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function appPropsXml(slideCount: number): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>Astlide</Application>
<Slides>${slideCount}</Slides>
</Properties>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRC-32 (IEEE 802.3)
// ═══════════════════════════════════════════════════════════════════════════

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
	let c = n;
	for (let k = 0; k < 8; k++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	CRC_TABLE[n] = c;
}

/** @internal */
export function crc32(buf: Buffer): number {
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Minimal ZIP writer (deflate, no ZIP64)
// ═══════════════════════════════════════════════════════════════════════════

interface ZipEntry {
	path: string;
	raw: Buffer;
	compressed: Buffer;
	crc: number;
	localHeaderOffset: number;
}

/** @internal */
export class ZipWriter {
	private entries: ZipEntry[] = [];
	private offset = 0;

	add(path: string, data: string | Buffer): void {
		const raw = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
		const compressed = deflateRawSync(raw, { level: 6 });
		const crc = crc32(raw);
		this.entries.push({
			path,
			raw,
			compressed,
			crc,
			localHeaderOffset: this.offset,
		});
		this.offset += 30 + Buffer.byteLength(path, "utf-8") + compressed.length;
	}

	toBuffer(): Buffer {
		const parts: Buffer[] = [];

		// Local file headers + compressed data
		for (const e of this.entries) {
			const pathBuf = Buffer.from(e.path, "utf-8");
			const header = Buffer.alloc(30);
			header.writeUInt32LE(0x04034b50, 0);
			header.writeUInt16LE(20, 4);
			header.writeUInt16LE(0x0808, 6);
			header.writeUInt16LE(8, 8);
			header.writeUInt16LE(0, 10);
			header.writeUInt16LE(0, 12);
			header.writeUInt32LE(e.crc, 14);
			header.writeUInt32LE(e.compressed.length, 18);
			header.writeUInt32LE(e.raw.length, 22);
			header.writeUInt16LE(pathBuf.length, 26);
			header.writeUInt16LE(0, 28);
			parts.push(header, pathBuf, e.compressed);
		}

		// Central directory
		const cdOffset = this.offset;
		let cdSize = 0;

		for (const e of this.entries) {
			const pathBuf = Buffer.from(e.path, "utf-8");
			const cd = Buffer.alloc(46);
			cd.writeUInt32LE(0x02014b50, 0);
			cd.writeUInt16LE(20, 4);
			cd.writeUInt16LE(20, 6);
			cd.writeUInt16LE(0x0808, 8);
			cd.writeUInt16LE(8, 10);
			cd.writeUInt16LE(0, 12);
			cd.writeUInt16LE(0, 14);
			cd.writeUInt32LE(e.crc, 16);
			cd.writeUInt32LE(e.compressed.length, 20);
			cd.writeUInt32LE(e.raw.length, 24);
			cd.writeUInt16LE(pathBuf.length, 28);
			cd.writeUInt16LE(0, 30);
			cd.writeUInt16LE(0, 32);
			cd.writeUInt16LE(0, 34);
			cd.writeUInt16LE(0, 36);
			cd.writeUInt32LE(0, 38);
			cd.writeUInt32LE(e.localHeaderOffset, 42);
			parts.push(cd, pathBuf);
			cdSize += 46 + pathBuf.length;
		}

		// End of central directory
		const eocd = Buffer.alloc(22);
		eocd.writeUInt32LE(0x06054b50, 0);
		eocd.writeUInt16LE(0, 4);
		eocd.writeUInt16LE(0, 6);
		eocd.writeUInt16LE(this.entries.length, 8);
		eocd.writeUInt16LE(this.entries.length, 10);
		eocd.writeUInt32LE(cdSize, 12);
		eocd.writeUInt32LE(cdOffset, 16);
		eocd.writeUInt16LE(0, 20);
		parts.push(eocd);

		return Buffer.concat(parts);
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// PptxFile — public API
// ═══════════════════════════════════════════════════════════════════════════

export interface PptxFileOptions {
	title?: string;
	author?: string;
	theme?: ThemeColors;
}

const DEFAULT_THEME: ThemeColors = {
	bg: "FFFFFF",
	fg: "1A1A1A",
	primary: "3B82F6",
	secondary: "64748B",
	accent: "F59E0B",
	muted: "F1F5F9",
	codeBg: "1E1E1E",
	codeFg: "D4D4D4",
};

export class PptxFile {
	private slides: SlideSpec[] = [];
	private title: string;
	private author: string;
	private theme: ThemeColors;

	constructor(opts: PptxFileOptions = {}) {
		this.title = opts.title ?? "";
		this.author = opts.author ?? "";
		this.theme = opts.theme ?? DEFAULT_THEME;
	}

	addSlide(spec: SlideSpec): void {
		this.slides.push(spec);
	}

	async save(outputPath: string): Promise<void> {
		const zip = new ZipWriter();
		const count = this.slides.length;

		// Boilerplate
		zip.add("[Content_Types].xml", contentTypesXml(count));
		zip.add("_rels/.rels", rootRelsXml());
		zip.add("ppt/presentation.xml", presentationXml(count));
		zip.add("ppt/_rels/presentation.xml.rels", presentationRelsXml(count));
		zip.add("ppt/slideMasters/slideMaster1.xml", slideMasterXml());
		zip.add("ppt/slideMasters/_rels/slideMaster1.xml.rels", slideMasterRelsXml());
		zip.add("ppt/slideLayouts/slideLayout1.xml", slideLayoutXml());
		zip.add("ppt/slideLayouts/_rels/slideLayout1.xml.rels", slideLayoutRelsXml());
		zip.add("ppt/theme/theme1.xml", themeXml(this.theme));
		zip.add("docProps/core.xml", corePropsXml(this.title, this.author));
		zip.add("docProps/app.xml", appPropsXml(count));

		// Slides
		for (let i = 0; i < count; i++) {
			const { xml, hyperlinks } = buildSlideXml(this.slides[i], i + 1);
			zip.add(`ppt/slides/slide${i + 1}.xml`, xml);
			zip.add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, buildSlideRels(hyperlinks));
		}

		await mkdir(dirname(outputPath), { recursive: true });
		await writeFile(outputPath, zip.toBuffer());
	}
}
