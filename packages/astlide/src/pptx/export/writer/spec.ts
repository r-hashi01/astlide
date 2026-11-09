/**
 * What the PPTX writer takes: slides as text boxes, rectangles, pictures, tables
 * and shapes in inches (the exporter lays them out), and fonts to embed.
 *
 * @module
 */

export interface TextRunOptions {
	fontSize?: number;
	color?: string;
	fontFace?: string;
	/** Font for East Asian characters (Japanese, Chinese, Korean): `<a:ea>`. */
	eaFontFace?: string;
	bold?: boolean;
	italic?: boolean;
	align?: "left" | "center" | "right";
	hyperlink?: { url: string };
	breakLine?: boolean;
	bullet?: boolean | { type: "number"; indent?: number } | { indent?: number };
	indentLevel?: number;
	paraSpaceAfter?: number;
	/** Exact line height of the paragraph, in points. */
	lineSpacing?: number;
	/** Extra space between characters, in points (CSS letter-spacing). */
	letterSpacing?: number;
	/** Highlight (text background) color, `RRGGBB`. */
	highlight?: string;
	underline?: boolean;
	strike?: boolean;
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
	/** Inner margin on every side, in inches (PowerPoint's default when omitted). */
	inset?: number;
}

export interface RectSpec {
	type: "rect";
	x: number;
	y: number;
	w: number;
	h: number;
	fill: string;
	fillTransparency?: number;
	line?: { color: string; transparency?: number /** points */; width?: number };
	/** Corner radius in inches (rounded rectangle). */
	radius?: number;
	/** No fill (border only). */
	noFill?: boolean;
	/** Linear gradient instead of the solid fill. */
	gradient?: GradientSpec;
	/** A preset pattern (lines in `color` over nothing) instead of the solid fill. */
	pattern?: { preset: string; color: string; transparency?: number };
}

/** A PNG placed on the slide (e.g. a rendered background). */
export interface ImageSpec {
	type: "image";
	x: number;
	y: number;
	w: number;
	h: number;
	/** PNG or JPEG bytes (see `format`). */
	data: Buffer;
	format?: "png" | "jpeg";
	name?: string;
	/** Opens this URL when the picture is clicked. */
	link?: string;
	/** Parts of the image cut off on each side, as fractions of its size (CSS background cover / position). */
	crop?: { left: number; top: number; right: number; bottom: number };
}

/** A linear gradient fill: CSS angle (0 = to top, 90 = to right) and stops at 0–1. */
export interface GradientSpec {
	angle: number;
	stops: { color: string; transparency?: number; pos: number }[];
}

/** A table cell border: color `RRGGBB`, width in points. */
export interface CellBorder {
	color: string;
	width: number;
	transparency?: number;
}

export interface TableCellSpec {
	runs: TextRun[];
	fill?: string;
	fillTransparency?: number;
	borders?: { left?: CellBorder; right?: CellBorder; top?: CellBorder; bottom?: CellBorder };
	/** Inner margins in inches. */
	margins?: { left: number; right: number; top: number; bottom: number };
	valign?: "top" | "middle" | "bottom";
	/** Columns this cell spans (the cells it covers follow as `merged`). */
	span?: number;
	/** Covered by the previous cell's span. */
	merged?: boolean;
}

/** A native PowerPoint table: editable cells on a column grid. Sizes in inches. */
export interface TableSpec {
	type: "table";
	x: number;
	y: number;
	w: number;
	h: number;
	columns: number[];
	rows: { h: number; cells: TableCellSpec[] }[];
}

/** Outline of a drawn shape. Width in points. */
export interface StrokeSpec {
	color: string;
	width: number;
	transparency?: number;
	dashed?: boolean;
	/** Arrowheads at the start / end of an open path. */
	head?: boolean;
	tail?: boolean;
}

/**
 * A shape drawn from SVG: an ellipse, or a freeform of straight segments.
 * Sizes in inches; path points relative to (x, y).
 */
export interface ShapeSpec {
	type: "shape";
	x: number;
	y: number;
	w: number;
	h: number;
	geom: "ellipse" | { paths: { points: [number, number][]; closed: boolean }[] };
	fill?: string;
	fillTransparency?: number;
	stroke?: StrokeSpec;
}

export type SlideElement = TextBoxSpec | RectSpec | ImageSpec | TableSpec | ShapeSpec;

export interface SlideSpec {
	background: string;
	/** Speaker notes (paragraphs separated by line breaks). */
	notes?: string;
	backgroundPath?: string;
	elements: SlideElement[];
}

/**
 * A font family embedded in the file, so PowerPoint shows the slides in it
 * without the font installed. Each face is a TrueType / OpenType file;
 * PowerPoint has four faces per family, so other weights are families of
 * their own (e.g. "Inter SemiBold" in its regular slot).
 */
export interface EmbeddedFont {
	/** Family name as the font's name table has it (name ID 1) and text runs use it. */
	typeface: string;
	regular?: Buffer;
	bold?: Buffer;
	italic?: Buffer;
	boldItalic?: Buffer;
}

/** The four faces PowerPoint has per family, in its order. */
export const FONT_SLOTS = ["regular", "bold", "italic", "boldItalic"] as const;
