/**
 * Minimal PPTX (OOXML) writer — zero external dependencies.
 *
 * Generates a valid .pptx file (ZIP of OOXML XML) using only Node.js built-ins
 * (`zlib` for deflate, `Buffer` for binary). The slide description is in
 * `ooxml/spec`, the slide XML in `ooxml/slide-xml`, the other parts in
 * `ooxml/package-xml` and the zip in `ooxml/zip-writer`; this file puts them
 * together.
 *
 * Usage:
 *   const pptx = new PptxFile({ title: "...", author: "..." });
 *   pptx.addSlide(slideSpec);
 *   await pptx.save("./output.pptx");
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { toEot } from "./eot";
import {
	appPropsXml,
	contentTypesXml,
	corePropsXml,
	notesMasterRelsXml,
	notesMasterXml,
	notesSlideRelsXml,
	notesSlideXml,
	presentationRelsXml,
	presentationXml,
	presPropsXml,
	rootRelsXml,
	slideLayoutRelsXml,
	slideLayoutXml,
	slideMasterRelsXml,
	slideMasterXml,
	tableStylesXml,
	themeXml,
	viewPropsXml,
} from "./ooxml/package-xml";
import { buildSlideRels, buildSlideXml } from "./ooxml/slide-xml";
import { type EmbeddedFont, FONT_SLOTS, type SlideSpec } from "./ooxml/spec";
import { buildDate, ZipWriter } from "./ooxml/zip-writer";
import { DEFAULT_THEME, type ThemeColors } from "./theme-map";

export interface PptxFileOptions {
	title?: string;
	author?: string;
	theme?: ThemeColors;
	/** Fonts to embed. */
	fonts?: EmbeddedFont[];
	/** The East Asian font of the theme (what PowerPoint uses for Japanese text typed into the file). */
	eaFont?: string;
	/** When the file is made (default: {@link buildDate}). */
	date?: Date;
}

/** Give every run with a font, in text boxes and table cells, `eaFont` for its East Asian text. */
function withEaFont(spec: SlideSpec, eaFont: string): void {
	const runs = spec.elements.flatMap((el) =>
		el.type === "textbox"
			? el.runs
			: el.type === "table"
				? el.rows.flatMap((r) => r.cells.flatMap((c) => c.runs))
				: [],
	);
	for (const r of runs)
		if (r.options?.fontFace && !r.options.eaFontFace) r.options.eaFontFace = eaFont;
}

export class PptxFile {
	private slides: SlideSpec[] = [];
	private title: string;
	private author: string;
	private theme: ThemeColors;
	private fonts: EmbeddedFont[];
	private eaFont: string;
	private date: Date;

	constructor(opts: PptxFileOptions = {}) {
		this.date = opts.date ?? buildDate();
		this.title = opts.title ?? "";
		this.author = opts.author ?? "";
		this.theme = opts.theme ?? DEFAULT_THEME;
		this.fonts = opts.fonts ?? [];
		this.eaFont = opts.eaFont ?? "";
	}

	addSlide(spec: SlideSpec): void {
		this.slides.push(spec);
	}

	async save(outputPath: string): Promise<void> {
		const zip = new ZipWriter(this.date);
		const count = this.slides.length;
		// Slides with speaker notes (1-based).
		const notes = this.slides.flatMap((s, i) => (s.notes?.trim() ? [i + 1] : []));

		// Boilerplate
		zip.add("[Content_Types].xml", contentTypesXml(count, notes));
		zip.add("_rels/.rels", rootRelsXml());
		// Embedded fonts, numbered in embeddedFontLst order.
		const fontParts: string[] = [];
		for (const f of this.fonts) {
			for (const slot of FONT_SLOTS) {
				const face = f[slot];
				if (!face) continue;
				const target = `fonts/font${fontParts.length + 1}.fntdata`;
				zip.add(`ppt/${target}`, toEot(face));
				fontParts.push(target);
			}
		}
		zip.add("ppt/presentation.xml", presentationXml(count, this.fonts, notes.length > 0));
		zip.add(
			"ppt/_rels/presentation.xml.rels",
			presentationRelsXml(count, fontParts, notes.length > 0),
		);
		zip.add("ppt/slideMasters/slideMaster1.xml", slideMasterXml());
		zip.add("ppt/slideMasters/_rels/slideMaster1.xml.rels", slideMasterRelsXml());
		zip.add("ppt/slideLayouts/slideLayout1.xml", slideLayoutXml());
		zip.add("ppt/slideLayouts/_rels/slideLayout1.xml.rels", slideLayoutRelsXml());
		zip.add("ppt/theme/theme1.xml", themeXml(this.theme, this.eaFont));
		if (notes.length) {
			zip.add("ppt/notesMasters/notesMaster1.xml", notesMasterXml());
			zip.add("ppt/notesMasters/_rels/notesMaster1.xml.rels", notesMasterRelsXml());
			zip.add("ppt/theme/theme2.xml", themeXml(this.theme, this.eaFont));
		}
		zip.add("ppt/presProps.xml", presPropsXml());
		zip.add("ppt/viewProps.xml", viewPropsXml());
		zip.add("ppt/tableStyles.xml", tableStylesXml());
		zip.add("docProps/core.xml", corePropsXml(this.title, this.author, this.date));
		zip.add("docProps/app.xml", appPropsXml(count));

		// Slides
		let mediaCount = 0;
		for (let i = 0; i < count; i++) {
			const spec = this.slides[i] as SlideSpec;
			if (this.eaFont) withEaFont(spec, this.eaFont);
			const { xml, hyperlinks, images } = buildSlideXml(spec, i + 1);
			const media = images.map((img) => {
				mediaCount++;
				zip.add(`ppt/media/image${mediaCount}.${img.ext}`, img.data);
				return { rId: img.rId, target: `../media/image${mediaCount}.${img.ext}` };
			});
			zip.add(`ppt/slides/slide${i + 1}.xml`, xml);
			const slideNotes = this.slides[i]?.notes?.trim();
			zip.add(
				`ppt/slides/_rels/slide${i + 1}.xml.rels`,
				buildSlideRels(
					hyperlinks,
					media,
					slideNotes ? `../notesSlides/notesSlide${i + 1}.xml` : undefined,
				),
			);
			if (slideNotes) {
				zip.add(`ppt/notesSlides/notesSlide${i + 1}.xml`, notesSlideXml(slideNotes, this.eaFont));
				zip.add(`ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`, notesSlideRelsXml(i + 1));
			}
		}

		await mkdir(dirname(outputPath), { recursive: true });
		await writeFile(outputPath, zip.toBuffer());
	}
}
