/**
 * PPTX → HTML slides: each slide of a PowerPoint file (or a Google Slides /
 * Keynote export) as HTML that reproduces it — text boxes, shapes, pictures
 * and tables at their positions on a 1920×1080 canvas, with the text kept as
 * text. Placeholders inherit position and text style from their layout and
 * master, as in PowerPoint; theme colors and fonts are resolved.
 *
 * The HTML is an Astlide `.html` slide body: it fills the whole slide
 * (including its padding) and carries the scoped resets it needs.
 *
 * @module
 */

import type { ThemeColors } from "./color";
import { notesOf } from "./import/notes";
import { placeholderOf, titleTypes } from "./import/placeholders";
import {
	artwork,
	canvasOpen,
	contextFor,
	IDENTITY,
	openPresentation,
	STYLE,
	spTree,
} from "./import/presentation";
import { renderTree } from "./import/shapes";
import { paragraphsText } from "./import/text";
import { kid, kids, textOf } from "./ooxml/xml";

export interface ImportedSlide {
	/** 1-based position in the presentation. */
	index: number;
	/** The slide as an HTML fragment (an Astlide `.html` slide body). */
	html: string;
	/** Speaker notes as plain text (paragraphs on separate lines). */
	notes: string;
	/** Text of the slide's title placeholder, if any. */
	title?: string;
	/** Hidden in the presentation (PowerPoint's "Hide slide"). */
	hidden: boolean;
}

export interface ImportedDeck {
	/** Slide size in EMU (914400 per inch). */
	width: number;
	height: number;
	slides: ImportedSlide[];
	title?: string;
	author?: string;
	/** The (first) master's theme: colors `rrggbb` by scheme name, heading / body fonts. */
	theme: { colors: ThemeColors; fonts: { heading?: string; body?: string } };
}

export interface PptxImportOptions {
	/**
	 * Where pictures and embedded fonts go: called once per file, returns the
	 * URL to use (or null to leave the file out). Default: pictures as inline `data:` URLs (self-contained
	 * HTML) and embedded fonts left out (they'd be repeated in every slide).
	 * SVG pictures are always inlined as `data:` URLs: an SVG file served
	 * from the site would run any script it holds when opened directly.
	 */
	media?: (file: { name: string; data: Buffer; type: string }) => string | null;
	/** Canvas size in px (default 1920×1080); other slide ratios are letterboxed. */
	canvas?: { width: number; height: number };
}

export function pptxToSlides(data: Uint8Array, options: PptxImportOptions = {}): ImportedDeck {
	const p = openPresentation(data, options);
	const { pkg } = p;

	let deckTheme: ImportedDeck["theme"] = { colors: {}, fonts: {} };
	const slides = p.slideParts.map((part, i) => {
		const slide = pkg.xml(part);
		if (!slide) throw new Error(`missing slide part ${part}`);
		const ctx = contextFor(p, part, i + 1);
		if (i === 0)
			deckTheme = {
				colors: ctx.colors.theme,
				fonts: { heading: ctx.fonts.major, body: ctx.fonts.minor },
			};
		const titleShape = kids(spTree(slide)).find((s) =>
			titleTypes.has(placeholderOf(s)?.type ?? ""),
		);
		const html =
			`${STYLE}${p.fontCss ? `<style>${p.fontCss}</style>` : ""}<div class="astlide-pptx">${canvasOpen(p, ctx, slide)}` +
			`${artwork(ctx, slide)}${renderTree(spTree(slide), IDENTITY, ctx, true)}\n</div></div>`;
		return {
			index: i + 1,
			html,
			notes: notesOf(pkg, part),
			title: titleShape
				? paragraphsText(kid(titleShape, "p:txBody")).trim() || undefined
				: undefined,
			hidden: slide.attribs.show === "0",
		};
	});

	const core = pkg.xml("docProps/core.xml");
	return {
		width: p.width,
		height: p.height,
		slides,
		title: textOf(kid(core, "dc:title")).trim() || undefined,
		author: textOf(kid(core, "dc:creator")).trim() || undefined,
		theme: deckTheme,
	};
}
