/**
 * The parts every presentation has besides its slides: content types,
 * relationships, the presentation, master, layout, notes, theme and properties.
 *
 * @module
 */

import type { ThemeColors } from "../theme-map";
import { langOf } from "./slide-xml";
import { type EmbeddedFont, FONT_SLOTS } from "./spec";
import { esc } from "./units";

const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// PowerPoint (unlike the schema) expects these parts and default text styles:
// without them it asks to "repair" the file. Modeled on what PowerPoint itself
// writes for a blank presentation.

/** `<a:lvlNpPr>` for levels 1..count: size in 1/100 pt, theme major / minor font. */
function levelStyles(
	count: number,
	opts: { size: number; font: "mj" | "mn"; spcBef?: boolean },
): string {
	const out: string[] = [];
	for (let level = 1; level <= count; level++) {
		const marL = (level - 1) * 457200;
		const spcBef = opts.spcBef ? '<a:spcBef><a:spcPct val="0"/></a:spcBef>' : "";
		out.push(
			`<a:lvl${level}pPr marL="${marL}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">` +
				`${spcBef}<a:buNone/>` +
				`<a:defRPr sz="${opts.size}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill>` +
				`<a:latin typeface="+${opts.font}-lt"/><a:ea typeface="+${opts.font}-ea"/><a:cs typeface="+${opts.font}-cs"/></a:defRPr>` +
				`</a:lvl${level}pPr>`,
		);
	}
	return out.join("");
}

export function presPropsXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentationPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"/>`;
}

export function viewPropsXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:viewPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`;
}

export function tableStylesXml(): string {
	// def: PowerPoint's built-in "Medium Style 2 - Accent 1".
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`;
}

export function contentTypesXml(slideCount: number, notes: number[] = []): string {
	const overrides: string[] = [];
	for (let i = 1; i <= slideCount; i++) {
		overrides.push(
			`<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
		);
	}
	if (notes.length) {
		overrides.push(
			'<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>',
			'<Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
		);
		for (const i of notes)
			overrides.push(
				`<Override PartName="/ppt/notesSlides/notesSlide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`,
			);
	}
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Default Extension="fntdata" ContentType="application/x-fontdata"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>
<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>
<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
${overrides.join("\n")}
</Types>`;
}

export function rootRelsXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

export function presentationRelsXml(
	slideCount: number,
	fontParts: string[],
	notes = false,
): string {
	const rels = [
		...(notes
			? [
					`<Relationship Id="rIdNm1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/>`,
				]
			: []),
		`<Relationship Id="rIdSm1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
		`<Relationship Id="rIdTheme1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`,
		`<Relationship Id="rIdPresProps" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>`,
		`<Relationship Id="rIdViewProps" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>`,
		`<Relationship Id="rIdTableStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>`,
	];
	for (let i = 1; i <= slideCount; i++) {
		rels.push(
			`<Relationship Id="rIdSlide${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`,
		);
	}
	for (const [i, target] of fontParts.entries()) {
		rels.push(
			`<Relationship Id="rIdFont${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="${target}"/>`,
		);
	}
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels.join("\n")}
</Relationships>`;
}

/** `<p:embeddedFontLst>` for {@link EmbeddedFont}s whose faces are numbered rIdFont1… in order. */
function embeddedFontLstXml(fonts: EmbeddedFont[]): string {
	if (fonts.length === 0) return "";
	let n = 0;
	const items = fonts.map((f) => {
		const slots = FONT_SLOTS.filter((slot) => f[slot])
			.map((slot) => `<p:${slot} r:id="rIdFont${++n}"/>`)
			.join("");
		return `<p:embeddedFont><p:font typeface="${esc(f.typeface)}"/>${slots}</p:embeddedFont>`;
	});
	return `<p:embeddedFontLst>${items.join("")}</p:embeddedFontLst>`;
}

export function presentationXml(slideCount: number, fonts: EmbeddedFont[], notes = false): string {
	const sldIds: string[] = [];
	for (let i = 1; i <= slideCount; i++) {
		sldIds.push(`<p:sldId id="${255 + i}" r:id="rIdSlide${i}"/>`);
	}
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"${fonts.length ? ' embedTrueTypeFonts="1"' : ""}>
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdSm1"/></p:sldMasterIdLst>
${notes ? '<p:notesMasterIdLst><p:notesMasterId r:id="rIdNm1"/></p:notesMasterIdLst>' : ""}
<p:sldIdLst>${sldIds.join("")}</p:sldIdLst>
<p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>
<p:notesSz cx="6858000" cy="9144000"/>
${embeddedFontLstXml(fonts)}
<p:defaultTextStyle>${levelStyles(9, { size: 1800, font: "mn" })}</p:defaultTextStyle>
</p:presentation>`;
}

export function slideMasterXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">
<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdLo1"/></p:sldLayoutIdLst>
<p:txStyles>
<p:titleStyle>${levelStyles(1, { size: 4400, font: "mj", spcBef: true })}</p:titleStyle>
<p:bodyStyle>${levelStyles(9, { size: 2800, font: "mn", spcBef: true })}</p:bodyStyle>
<p:otherStyle>${levelStyles(9, { size: 1800, font: "mn" })}</p:otherStyle>
</p:txStyles>
</p:sldMaster>`;
}

export function slideMasterRelsXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdLo1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;
}

export function slideLayoutXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1">
<p:cSld name="Blank"><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;
}

export function slideLayoutRelsXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdSm" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;
}

const CLR_MAP =
	'<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';
const GROUP_PROPS =
	'<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

/** The notes page: the slide picture above, the notes text below (portrait, as PowerPoint's). */
export function notesMasterXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notesMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">
<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP_PROPS}
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="381000" y="685800"/><a:ext cx="6096000" cy="3429000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>
</p:spTree></p:cSld>
${CLR_MAP}
<p:notesStyle>${levelStyles(9, { size: 1200, font: "mn" })}</p:notesStyle>
</p:notesMaster>`;
}

export function notesMasterRelsXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme2.xml"/>
</Relationships>`;
}

/** A slide's notes page: one paragraph per line of `notes` (blank lines dropped). */
export function notesSlideXml(notes: string, eaFont?: string): string {
	const paras = notes
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => {
			const ea = eaFont ? `<a:ea typeface="${esc(eaFont)}"/>` : "";
			return `<a:p><a:r><a:rPr lang="${langOf(l)}" dirty="0">${ea}</a:rPr><a:t>${esc(l)}</a:t></a:r></a:p>`;
		})
		.join("");
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">
<p:cSld><p:spTree>${GROUP_PROPS}
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras || '<a:p><a:endParaRPr lang="en-US"/></a:p>'}</p:txBody></p:sp>
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:notes>`;
}

export function notesSlideRelsXml(slide: number): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdNm" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/>
<Relationship Id="rIdSlide" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${slide}.xml"/>
</Relationships>`;
}

export function themeXml(theme: ThemeColors, eaFont = ""): string {
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
<a:majorFont><a:latin typeface="Calibri"/><a:ea typeface="${esc(eaFont)}"/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="${esc(eaFont)}"/><a:cs typeface=""/></a:minorFont>
</a:fontScheme>
<a:fmtScheme name="Astlide">
<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
</a:fmtScheme>
</a:themeElements>
<a:objectDefaults/>
<a:extraClrSchemeLst/>
</a:theme>`;
}

export function corePropsXml(title: string, author: string, date: Date): string {
	// W3CDTF without fractional seconds: Office treats "…:45.652Z" as corrupt
	// content and asks to repair the file.
	const now = date.toISOString().replace(/\.\d+Z$/, "Z");
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(title)}</dc:title>
<dc:creator>${esc(author)}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

export function appPropsXml(slideCount: number): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>Astlide</Application>
<Slides>${slideCount}</Slides>
</Properties>`;
}
