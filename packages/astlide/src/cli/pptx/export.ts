/**
 * PPTX export: the built print view (`/<deck>/all`) is laid out by the
 * layout engine (`@astlide/core/engine`) — CSS cascade, flexbox and
 * font-metric line breaking, no browser — and each slide's paint items become native PowerPoint shapes,
 * text boxes and pictures.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Box, Scene, SceneItem, TableBox } from "@astlide/core/engine";
import { exportSiteDir } from "@astlide/core/utils/export-build.ts";
import { mermaidThemeFor } from "@astlide/core/utils/mermaid.ts";
import { FetchBudget } from "@astlide/core/utils/network.ts";
import type { ChildNode, Element } from "domhandler";
import { parseDocument } from "htmlparser2";
import { type EmbedInfo, resolveEmbeds } from "./embeds";
import { embeddingPermissions, withLegacyFamilyOnly } from "./eot";
import {
	type CellBorder,
	type EmbeddedFont,
	PptxFile,
	type SlideElement,
	type SlideSpec,
	type TableCellSpec,
	type TableSpec,
	type TextBoxSpec,
	type TextRun,
	type TextRunOptions,
} from "./ooxml-writer";
import { type SvgNode, svgToShapes } from "./svg-shapes";
import { getTheme } from "./theme-map";

export interface PptxOptions {
	/** Project root (built into the export's own folder, see utils/export-build). */
	root: string;
	output: string;
	/** Skip the build: use the export's last build, else the existing dist/. */
	build?: boolean;
}

/** Deck names: the directories in src/content/decks. */
export async function getDecks(root: string): Promise<string[]> {
	const entries = await readdir(join(root, "src", "content", "decks"), { withFileTypes: true });
	return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/** The deck's `_config.json` (title, author, theme), or `{}`. */
async function readDeckConfig(root: string, deck: string): Promise<Record<string, unknown>> {
	try {
		const path = join(root, "src", "content", "decks", deck, "_config.json");
		return JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
	} catch {
		return {};
	}
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

const SLIDE_W_IN = 10;
const WEIGHT_NAMES: Record<number, string> = {
	100: "Thin",
	200: "ExtraLight",
	300: "Light",
	500: "Medium",
	600: "SemiBold",
	800: "ExtraBold",
	900: "Black",
};

/** PowerPoint only knows regular / bold: other weights go by their own face name. */
function fontFor(family: string, weight: number): { face: string; bold: boolean } {
	if (weight >= 700 && weight < 800) return { face: family, bold: true };
	if (weight === 400) return { face: family, bold: false };
	const name = WEIGHT_NAMES[Math.round(weight / 100) * 100];
	// Static faces already carry the weight in their family name ("Inter SemiBold").
	if (!name || family.endsWith(` ${name}`)) return { face: family, bold: false };
	return { face: `${family} ${name}`, bold: false };
}

const hex = (c: { hex: string }) => c.hex.toUpperCase();

type TextItem = Extract<SceneItem, { kind: "text" }>;
type Engine = typeof import("@astlide/core/engine");

/** Pixels per CSS px when rasterizing vector images (sharp at full-screen size). */
const RASTER_SCALE = 2;

/**
 * An image's data and natural size in CSS px: PNG and JPEG as they are, SVG
 * as text (rasterized when placed). Null when it can't be read.
 */
type ImageSource =
	| { bitmap: Buffer; format: "png" | "jpeg"; size: { w: number; h: number } }
	| { svg: string; size: { w: number; h: number } };

/** Bytes of a fetched remote image (see {@link fetchImages}). */
const remoteImages = new Map<string, Buffer | null>();

/** Natural size of a PNG (IHDR) or JPEG (first SOF marker). */
function bitmapSize(b: Buffer): { format: "png" | "jpeg"; size: { w: number; h: number } } | null {
	if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47)
		return { format: "png", size: { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } };
	if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
		for (let i = 2; i + 9 < b.length; ) {
			if (b[i] !== 0xff) return null;
			const marker = b[i + 1] ?? 0;
			const len = b.readUInt16BE(i + 2);
			if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
				return { format: "jpeg", size: { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) } };
			i += 2 + len;
		}
	}
	return null;
}

function imageSource(
	src: string,
	dist: string,
	distFile: (dist: string, url: string) => string | null,
): ImageSource | null {
	let bytes: Buffer | null = null;
	const data = src.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
	if (data) {
		const body = data[3] ?? "";
		bytes = data[2] ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body));
	} else if (/^https?:\/\//.test(src)) {
		bytes = remoteImages.get(src) ?? null;
	} else {
		const path = src.startsWith("/") ? distFile(dist, src) : null;
		if (path) bytes = readFileSync(path);
	}
	if (!bytes) return null;
	const bitmap = bitmapSize(bytes);
	if (bitmap) return { bitmap: bytes, ...bitmap };
	const svg = bytes.toString("utf-8");
	// The root tag found by index, not by a regex scanning to its `>` (quadratic on a hostile file).
	const start = svg.search(/<svg[\s>]/);
	if (start < 0) return null;
	const end = svg.indexOf(">", start);
	const root = end < 0 ? "" : svg.slice(start, Math.min(end + 1, start + 4096));
	const attr = (name: string) =>
		Number.parseFloat(root.match(new RegExp(`\\s${name}="([\\d.]+)(px)?"`))?.[1] ?? "");
	const view = root.match(/viewBox="[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/);
	const w = attr("width") || Number(view?.[1] ?? 300);
	const h = attr("height") || Number(view?.[2] ?? 150);
	return { svg, size: { w, h } };
}

/** SVG drawn as a picture, or null (with a warning) when it can't be — too large, unreadable. */
function svgPicture(
	engine: Engine,
	svg: string,
	width: number,
	fontFiles: string[],
): Buffer | null {
	try {
		return engine.svgToPng(svg, width, fontFiles);
	} catch (error) {
		console.warn(`  ⚠ SVG image left out: ${(error as Error).message.split("\n")[0]}`);
		return null;
	}
}

function rasterize(
	engine: Engine,
	source: ImageSource,
	width: number,
	fontFiles: string[],
): Buffer | null {
	return "bitmap" in source
		? source.bitmap
		: svgPicture(engine, source.svg, width * RASTER_SCALE, fontFiles);
}

/** Largest remote image an export downloads, in bytes. */
const IMAGE_LIMIT = 20 * 1024 * 1024;

/**
 * Fetch remote images (e.g. video thumbnails) ahead of the export, cached on
 * disk. Offline, failing, oversized or refused ones (see
 * `exportFetch`, or past the {@link FetchBudget}) are left out with a warning: their stand-in
 * (background, play button, link) still shows. `urls` maps each URL to who
 * chose it: the deck, or a remote page (thumbnails).
 */
async function fetchImages(
	urls: Map<string, "deck" | "remote">,
	cacheDir: string,
	budget: FetchBudget,
): Promise<void> {
	await mkdir(cacheDir, { recursive: true });
	const failed: string[] = [];
	await Promise.all(
		[...urls].map(async ([url, source]) => {
			const file = join(cacheDir, createHash("sha256").update(url).digest("hex"));
			if (existsSync(file)) {
				remoteImages.set(url, readFileSync(file));
				return;
			}
			try {
				const res = await budget.fetch(url, { limit: IMAGE_LIMIT, source });
				if (!res.ok) throw new Error(String(res.status));
				const bytes = res.body;
				await writeFile(file, bytes);
				remoteImages.set(url, bytes);
			} catch {
				remoteImages.set(url, null);
				failed.push(url);
			}
		}),
	);
	if (failed.length) console.warn(`  ⚠ images not downloaded (offline?): ${failed.join(", ")}`);
}

/**
 * An embed with no static stand-in (an `<iframe>` of another site): a card
 * in its place naming what it shows, linked to it — its content can only be
 * drawn by a browser.
 */
/** `text` cut to about `chars` characters, with an ellipsis (captions don't wrap). */
const fit = (text: string, chars: number) =>
	text.length <= chars ? text : `${text.slice(0, Math.max(1, Math.floor(chars) - 1)).trimEnd()}…`;

function embedCard(
	item: { x: number; y: number; w: number; h: number; src: string; title: string },
	fontFace: string,
	k: number,
	info?: EmbedInfo,
): SlideElement[] {
	let host = item.src;
	try {
		host = new URL(item.src).host;
	} catch {}
	const label = info?.title || item.title || host || "Embedded content";
	const web = (url: string | undefined) => (url && /^https?:\/\//i.test(url) ? url : undefined);
	const link = web(info?.link) ?? web(item.src);
	const size = Math.max(12, Math.min(28, item.h / 8));
	// With a thumbnail: the picture (cover), linked, with the title along the bottom.
	const thumb = info?.thumbnail ? remoteImages.get(info.thumbnail) : null;
	const bitmap = thumb ? bitmapSize(thumb) : null;
	const place =
		thumb && bitmap
			? placeBackground(item, { size: "cover", position: "center" }, bitmap.size)
			: null;
	if (thumb && bitmap && place) {
		const bar = Math.max(size * 2, item.h * 0.16);
		return [
			{
				type: "image",
				x: place.visible.x * k,
				y: place.visible.y * k,
				w: place.visible.w * k,
				h: place.visible.h * k,
				data: thumb,
				format: bitmap.format,
				crop: place.crop,
				link,
			},
			{
				type: "rect",
				x: item.x * k,
				y: (item.y + item.h - bar) * k,
				w: item.w * k,
				h: bar * k,
				fill: "000000",
				fillTransparency: 40,
			},
			{
				type: "textbox",
				runs: [
					{
						text: `▶ ${fit(label, (item.w - size * 1.2) / (size * 0.8 * 0.58))}`,
						options: {
							fontSize: size * 0.8 * k * 72,
							color: "FFFFFF",
							fontFace,
							bold: true,
						},
					},
				],
				x: (item.x + size * 0.6) * k,
				y: (item.y + item.h - bar) * k,
				w: (item.w - size * 1.2) * k,
				h: bar * k,
				valign: "middle",
				wrap: false,
				inset: 0,
			},
		];
	}
	return [
		{
			type: "rect",
			x: item.x * k,
			y: item.y * k,
			w: item.w * k,
			h: item.h * k,
			fill: "F1F5F9",
			line: { color: "CBD5E1", width: 1 },
			radius: 8 * k,
		},
		{
			type: "textbox",
			runs: [
				{
					text: `▶ ${label}`,
					options: {
						fontSize: size * k * 72,
						color: "334155",
						fontFace,
						bold: true,
						breakLine: true,
						align: "center",
					},
				},
				{
					text: link ?? "",
					options: {
						fontSize: size * 0.7 * k * 72,
						color: "2563EB",
						fontFace,
						underline: !!link,
						hyperlink: link ? { url: link } : undefined,
						align: "center",
					},
				},
			],
			x: item.x * k,
			y: item.y * k,
			w: item.w * k,
			h: item.h * k,
			align: "center",
			valign: "middle",
			wrap: true,
		},
	];
}

/** One `background-position` component as an offset into `free` px of room. */
function positionOffset(token: string | undefined, free: number): number {
	const t = (token ?? "center").trim();
	if (t === "left" || t === "top") return 0;
	if (t === "right" || t === "bottom") return free;
	if (t === "center") return free / 2;
	const n = Number.parseFloat(t);
	if (Number.isNaN(n)) return free / 2;
	return t.endsWith("%") ? (free * n) / 100 : n;
}

/**
 * Where a CSS background image lands in its box (`background-size`:
 * cover / contain / lengths / auto; `background-position`), and the part of
 * it inside the box as a crop. Null when none of it is visible.
 */
function placeBackground(
	box: { x: number; y: number; w: number; h: number },
	bg: { size: string; position: string },
	natural: { w: number; h: number },
) {
	const size = bg.size.trim().split(/\s+/);
	let w = natural.w;
	let h = natural.h;
	if (size[0] === "cover" || size[0] === "contain") {
		const s = (size[0] === "cover" ? Math.max : Math.min)(box.w / natural.w, box.h / natural.h);
		w = natural.w * s;
		h = natural.h * s;
	} else {
		const len = (t: string | undefined, basis: number) =>
			!t || t === "auto"
				? null
				: t.endsWith("%")
					? (basis * Number.parseFloat(t)) / 100
					: Number.parseFloat(t);
		const sw = len(size[0], box.w);
		const sh = len(size[1], box.h);
		if (sw !== null && sh !== null) [w, h] = [sw, sh];
		else if (sw !== null) [w, h] = [sw, (sw * natural.h) / natural.w];
		else if (sh !== null) [w, h] = [(sh * natural.w) / natural.h, sh];
	}
	// "center" alone means both; a single vertical keyword puts the horizontal at center.
	let [px, py] = bg.position.trim().split(/\s+/);
	if (py === undefined && (px === "top" || px === "bottom")) [px, py] = ["center", px];
	const drawn = {
		x: box.x + positionOffset(px, box.w - w),
		y: box.y + positionOffset(py ?? "center", box.h - h),
		w,
		h,
	};
	const left = Math.max(box.x, drawn.x);
	const top = Math.max(box.y, drawn.y);
	const right = Math.min(box.x + box.w, drawn.x + w);
	const bottom = Math.min(box.y + box.h, drawn.y + h);
	if (right <= left || bottom <= top || w <= 0 || h <= 0) return null;
	return {
		drawn,
		visible: { x: left, y: top, w: right - left, h: bottom - top },
		crop: {
			left: (left - drawn.x) / w,
			top: (top - drawn.y) / h,
			right: (drawn.x + w - right) / w,
			bottom: (drawn.y + h - bottom) / h,
		},
	};
}

/** SVG names the HTML parser lowercased, restored for SVG renderers. */
const SVG_CASE = [
	"viewBox",
	"preserveAspectRatio",
	"markerWidth",
	"markerHeight",
	"markerUnits",
	"refX",
	"refY",
	"gradientUnits",
	"gradientTransform",
	"patternUnits",
	"stdDeviation",
	"textLength",
	"linearGradient",
	"radialGradient",
	"clipPath",
	"textPath",
	"foreignObject",
];

/** Inline SVG markup as a standalone SVG document (resvg): names, namespace, currentColor. */
function rasterReady(markup: string, color: string): string {
	let svg = markup;
	for (const name of SVG_CASE)
		svg = svg.replace(new RegExp(`\\b${name.toLowerCase()}\\b`, "g"), name);
	if (!/\sxmlns=/.test(svg.slice(0, svg.indexOf(">"))))
		svg = svg.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
	return svg.replace(/currentColor/gi, `#${color}`);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeEntities = (s: string) =>
	s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) =>
		e[0] === "#"
			? String.fromCodePoint(Number.parseInt(e.slice(e[1] === "x" ? 2 : 1), e[1] === "x" ? 16 : 10))
			: (ENTITIES[e] ?? m),
	);

/**
 * Mermaid diagrams are rendered by the browser on the slides; here they are
 * rendered ahead of layout (without a browser) and put in the page as SVG
 * images sized like the slides size them (Mermaid's natural size scaled
 * from its 16px text to the slide's font size, at most the content width).
 * Without `mermaid` installed the page is left as it is.
 */
async function withDiagrams(
	engine: Engine,
	html: string,
	options: {
		root: string;
		font: () => { family: string; font: { familyName: string }; file?: string };
	},
): Promise<string> {
	const blocks = [...html.matchAll(/<pre class="astlide-mermaid"[^>]*>([\s\S]*?)<\/pre>/g)];
	if (blocks.length === 0) return html;
	const mermaidPath = engine.resolveEsm("mermaid", options.root);
	if (!mermaidPath) {
		console.warn("  ⚠ diagrams skipped: install `mermaid` in the project to export them");
		return html;
	}
	const face = options.font();
	if (!face.file) {
		console.warn("  ⚠ diagrams skipped: no font file for their labels");
		return html;
	}
	const theme = mermaidThemeFor(html.match(/<html[^>]*\sdata-theme="([^"]*)"/)?.[1]);
	const rendered = await engine.renderMermaid(
		blocks.map((m) => decodeEntities(m[1] ?? "")),
		{ mermaidPath, theme, fontFamily: face.font.familyName, fontFile: face.file },
	);
	let out = "";
	let at = 0;
	blocks.forEach((m, i) => {
		const d = rendered[i];
		const start = m.index ?? 0;
		out += html.slice(at, start);
		at = start + m[0].length;
		if (!d) {
			out += m[0];
			return;
		}
		const src = `data:image/svg+xml;base64,${Buffer.from(d.svg).toString("base64")}`;
		out +=
			`<div style="display:flex;justify-content:center;margin:0.5em 0">` +
			`<img src="${src}" width="${d.width}" height="${d.height}" alt="" ` +
			`style="display:block;width:${d.width / 16}em;max-width:100%"></div>`;
	});
	return out + html.slice(at);
}

/**
 * The font files behind the text, by the typeface and slot the runs use
 * (see {@link fontFor}), so PowerPoint shows them without the fonts
 * installed. Fonts whose license forbids embedding (`fsType` restricted)
 * are left out.
 */
function embeddedFonts(items: TextItem[]): EmbeddedFont[] {
	const byFace = new Map<string, EmbeddedFont>();
	const skipped = new Set<string>();
	for (const item of items) {
		const { file, italic } = item.font;
		if (!file) continue;
		const f = fontFor(item.font.family, item.font.weight);
		const slot = f.bold ? (italic ? "boldItalic" : "bold") : italic ? "italic" : "regular";
		const font = byFace.get(f.face) ?? { typeface: f.face };
		if (font[slot]) continue;
		const data = readFileSync(file);
		if (embeddingPermissions(data) & 0x0002) {
			skipped.add(f.face);
			continue;
		}
		// Weights PowerPoint has no slot for are families of their own.
		const ownFamily = item.font.weight !== 400 && !f.bold;
		font[slot] = ownFamily ? withLegacyFamilyOnly(data) : data;
		byFace.set(f.face, font);
	}
	if (skipped.size)
		console.warn(`  ⚠ not embedded (license restricts embedding): ${[...skipped].join(", ")}`);
	return [...byFace.values()];
}

/**
 * The DrawingML preset pattern closest to parallel lines across a gradient
 * at CSS `angle`, `period` px apart on the 1920 px slide: horizontal,
 * vertical or diagonal, light (8 px or more apart) or not.
 */
export function stripePreset(angle: number, period: number): string {
	const a = ((Math.round(angle / 45) % 4) + 4) % 4; // 0: to top, 1: 45°, 2: 90°, 3: 135°
	const light = period >= 8;
	switch (a) {
		case 0:
			return light ? "ltHorz" : "horz";
		case 2:
			return light ? "ltVert" : "vert";
		case 1:
			return light ? "ltDnDiag" : "dnDiag";
		default:
			return light ? "ltUpDiag" : "upDiag";
	}
}

function runOptions(item: TextItem, k: number): TextRunOptions {
	const f = fontFor(item.font.family, item.font.weight);
	return {
		fontSize: item.font.size * k * 72,
		color: hex(item.color),
		fontFace: f.face,
		bold: f.bold,
		italic: item.font.italic,
		letterSpacing: item.letterSpacing ? item.letterSpacing * k * 72 : undefined,
		highlight: highlightOf.get(item),
		underline: item.underline,
		strike: item.strike,
	};
}

type Rgb = [number, number, number];
const rgb = (h: string): Rgb => [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Rgb;
const toHex = (c: Rgb) =>
	c
		.map((v) => Math.round(v).toString(16).padStart(2, "0"))
		.join("")
		.toUpperCase();

/** Highlight color of text inside an inline background (inline code …). */
const highlightOf = new WeakMap<TextItem, string>();

/**
 * Inline backgrounds (inline code chips …) become the highlight of the text
 * they hold, so they move with it — PowerPoint flows the text with its own
 * metrics, and a separate shape would drift. Returns the rects replaced.
 * The highlight is opaque: translucent fills are composited over what lies
 * beneath them.
 */
function inlineHighlights(scene: Scene): Set<SceneItem> {
	const replaced = new Set<SceneItem>();
	const texts = scene.items.filter((t): t is TextItem => t.kind === "text");
	scene.items.forEach((r, index) => {
		if (r.kind !== "rect" || !r.inline || !r.fill || r.fill.alpha <= 0) return;
		const inside = texts.filter((t) => {
			const cx = t.x + t.w / 2;
			const cy = t.y + t.h / 2;
			return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
		});
		if (inside.length === 0) return;
		// What the chip is painted over: the slide, then every box below it.
		let under = rgb(scene.background.hex);
		const cx = r.x + r.w / 2;
		const cy = r.y + r.h / 2;
		for (const b of scene.items.slice(0, index)) {
			if (b.kind !== "rect" || b.inline || !b.fill) continue;
			if (cx < b.x || cx > b.x + b.w || cy < b.y || cy > b.y + b.h) continue;
			under = blend(rgb(b.fill.hex), b.fill.alpha, under);
		}
		const color = toHex(blend(rgb(r.fill.hex), r.fill.alpha, under));
		for (const t of inside) highlightOf.set(t, color);
		replaced.add(r);
	});
	return replaced;
}

function blend(top: Rgb, alpha: number, bottom: Rgb): Rgb {
	return top.map((v, i) => v * alpha + (bottom[i] ?? 0) * (1 - alpha)) as Rgb;
}

/** Placeholder text box of a block, filled by {@link fillBlock} once all its lines are in. */
const boxOf = new WeakMap<TextItem[], TextBoxSpec>();
function blockBox(group: TextItem[]): TextBoxSpec {
	const box: TextBoxSpec = { type: "textbox", runs: [], x: 0, y: 0, w: 0, h: 0 };
	boxOf.set(group, box);
	return box;
}

/**
 * One text box per block of text, one paragraph per line box at its exact
 * line height, so the text keeps the slide's line breaks and stays editable
 * as a whole. Gaps between runs (spaces trimmed by layout, code indentation)
 * become spaces again.
 */
function fillBlock(box: TextBoxSpec, group: TextItem[], k: number): TextBoxSpec {
	const t = blockText(group, k);
	if (!t) return box;
	const { block, align, top, bottom, right } = t;
	// The last paragraph ends the text: no trailing empty paragraph.
	return {
		...box,
		runs: t.runs,
		x: block.x * k,
		y: top * k,
		// Centered / right text needs the block's width; left text gets slack
		// because PowerPoint's glyph widths differ slightly (lines never wrap).
		w: align === "left" ? Math.max(block.w, (right - block.x) * 1.05) * k + 0.05 : block.w * k,
		h: (bottom - top) * k,
		align,
		valign: "top",
		wrap: false,
		inset: 0,
	};
}

/**
 * A laid-out table as a native PowerPoint table: the column grid and row
 * heights, each cell's background, borders, padding (as margins) and text.
 */
function tableSpec(
	engine: Engine,
	t: TableBox,
	items: TextItem[],
	boxes: Box[],
	k: number,
): Omit<TableSpec, "type"> {
	const styleOf = (eid: number) => boxes.find((b) => b.eid === eid);
	const pt = (px: number) => px * k * 72;
	const color = (c: { hex: string; alpha: number } | null) =>
		c && c.alpha > 0
			? { color: c.hex.toUpperCase(), transparency: Math.round((1 - c.alpha) * 100) }
			: null;
	const n = Math.max(
		t.columns.length,
		...t.rows.flatMap((r) => r.cells.map((c) => c.col + c.span)),
	);
	const known = t.columns.filter((w) => w > 0);
	const fallback = known.length
		? (t.w - known.reduce((a, b) => a + b, 0)) / Math.max(1, n - known.length)
		: t.w / n;
	const columns = [...Array(n).keys()].map((i) => (t.columns[i] || fallback) * k);
	const rows = t.rows.map((r) => {
		const cells: TableCellSpec[] = [];
		const rowBox = styleOf(r.eid);
		for (const c of [...r.cells].sort((a, b) => a.col - b.col)) {
			while (cells.length < c.col) cells.push({ runs: [] });
			const inside = items.filter((it) => {
				const cx = it.x + it.w / 2;
				const cy = it.y + it.h / 2;
				return cx >= c.x && cx <= c.x + c.w && cy >= c.y && cy <= c.y + c.h;
			});
			const byBlock = new Map<number, TextItem[]>();
			for (const it of inside) {
				const id = it.block?.id ?? -1;
				byBlock.set(id, [...(byBlock.get(id) ?? []), it]);
			}
			const runs = [...byBlock.values()]
				.map((g) => blockText(g, k))
				.filter((b) => b !== null)
				.sort((a, b) => a.top - b.top)
				.flatMap((b) => b.runs);
			const alpha = styleOf(c.eid)?.alpha ?? 1;
			const bg =
				color(engine.parseColor(c.style.get("background-color"))) ??
				color(rowBox ? engine.parseColor(rowBox.style.get("background-color")) : null);
			const side = (s: "top" | "right" | "bottom" | "left"): CellBorder | undefined => {
				const c2 = color(
					engine.parseColor(c.style.get(`border-${s}-color`) ?? c.style.get("color")),
				);
				return c.border[s] > 0 && c2 ? { ...c2, width: pt(c.border[s]) } : undefined;
			};
			const va = c.style.get("vertical-align") ?? "middle";
			cells.push({
				runs,
				fill: bg?.color,
				fillTransparency: bg ? Math.round(100 - (100 - bg.transparency) * alpha) : undefined,
				borders: {
					top: side("top"),
					right: side("right"),
					bottom: side("bottom"),
					left: side("left"),
				},
				margins: {
					top: c.padding.top * k,
					right: c.padding.right * k,
					bottom: c.padding.bottom * k,
					left: c.padding.left * k,
				},
				valign: va === "top" ? "top" : va === "bottom" ? "bottom" : "middle",
				span: c.span,
			});
			for (let i = 1; i < c.span; i++) cells.push({ runs: [], merged: true });
		}
		while (cells.length < n) cells.push({ runs: [] });
		return { h: r.h * k, cells };
	});
	return {
		x: t.x * k,
		y: t.y * k,
		w: columns.reduce((a, b) => a + b, 0),
		h: t.h * k,
		columns,
		rows,
	};
}

/** A block's text as paragraphs (one per line box), with the lines' extent. */
function blockText(group: TextItem[], k: number) {
	const block = group[0]?.block;
	if (!block) return null;
	const byLine = new Map<number, TextItem[]>();
	for (const it of group) {
		const line = byLine.get(it.line ?? 0) ?? [];
		line.push(it);
		byLine.set(it.line ?? 0, line);
	}
	const indices = [...byLine.keys()].sort((a, b) => a - b);
	const align = /center/.test(block.align)
		? "center"
		: /right|end/.test(block.align)
			? "right"
			: "left";
	const runs: TextRun[] = [];
	let top = 0;
	let bottom = 0;
	let right = block.x;
	let prev: { index: number; bottom: number } | null = null;
	for (const index of indices) {
		const items = (byLine.get(index) ?? []).sort((a, b) => a.x - b.x);
		const first = items[0];
		if (!first) continue;
		const lineTop = first.lineTop ?? first.y;
		const lineHeight = first.lineHeight ?? first.h;
		if (prev === null) top = lineTop;
		else if (index > prev.index + 1) {
			// Empty line boxes (blank lines in code) in between.
			const count = index - prev.index - 1;
			const each = (lineTop - prev.bottom) / count;
			for (let i = 0; i < count; i++)
				runs.push({ text: "", options: { breakLine: true, lineSpacing: each * k * 72 } });
		}
		// Left-aligned lines keep their indentation as spaces; centered / right ones are aligned by PowerPoint.
		let x = align === "left" ? block.x : first.x;
		const lineRuns: TextRun[] = [];
		for (const it of items) {
			const gap = it.x - x;
			const spaces = Math.round(gap / it.space) || (gap > it.space * 0.3 ? 1 : 0);
			if (spaces > 0) lineRuns.push({ text: " ".repeat(spaces), options: runOptions(it, k) });
			lineRuns.push({ text: it.text, options: runOptions(it, k) });
			x = it.x + it.w;
			right = Math.max(right, x);
		}
		const last = lineRuns[lineRuns.length - 1];
		if (last)
			last.options = { ...last.options, breakLine: true, align, lineSpacing: lineHeight * k * 72 };
		runs.push(...lineRuns);
		bottom = lineTop + lineHeight;
		prev = { index, bottom };
	}
	return { block, runs, align: align as "left" | "center" | "right", top, bottom, right };
}

/** Japanese / Chinese / Korean text. */
const CJK_TEXT = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/;
/** Font families for East Asian text, by name. */
const CJK_FAMILY =
	/\b(JP|KR|SC|TC|HK|CJK)\b|Gothic|Mincho|Hiragino|Meiryo|Yu ?(Gothic|Mincho)|BIZ UD|M PLUS|Kosugi|Sawarabi|Zen (Kaku|Maru|Old)|Source Han|Pretendard|游|ゴシック|明朝|源ノ/i;
/** The East Asian font PPTX files name when the CSS doesn't: installed with Office on Windows and macOS. */
const DEFAULT_EA_FONT = "Yu Gothic";

/** A Google Fonts family's regular face (downloaded into the project's font cache), or null. */
async function googleFontFile(
	engine: typeof import("@astlide/core/engine"),
	family: string,
	root: string,
): Promise<string | null> {
	const registry = new engine.FontRegistry();
	const missing = await engine.loadGoogleFonts(
		registry,
		[family],
		join(root, "node_modules", ".cache", "astlide-fonts"),
		[400],
	);
	return missing.length ? null : (registry.files()[0] ?? null);
}

/**
 * Speaker notes of each slide in the print view (`body > .slide`, as laid
 * out): `<SpeakerNotes>` content, else the frontmatter / comment notes the
 * page carries as `[data-slide-notes="meta"]`. Plain text, a line per paragraph.
 */
export function speakerNotes(html: string): string[] {
	const doc = parseDocument(html);
	const body = findAll((e) => e.name === "body", doc.children)[0];
	const slides = (body?.children ?? []).filter(
		(c): c is Element => isTag(c) && /(^|\s)slide(\s|$)/.test(c.attribs.class ?? ""),
	);
	return slides.map((slide) => {
		const all = findAll((e) => e.attribs["data-slide-notes"] !== undefined, slide.children);
		const own = all.find((e) => e.attribs["data-slide-notes"] !== "meta");
		const el = own ?? all[0];
		return el ? plainText(el).trim() : "";
	});
}

const isTag = (n: ChildNode): n is Element => n.type === "tag";

/** Elements matching `test` below `nodes`, in document order. */
function findAll(test: (e: Element) => boolean, nodes: ChildNode[]): Element[] {
	const out: Element[] = [];
	for (const n of nodes) {
		if (!isTag(n)) continue;
		if (test(n)) out.push(n);
		out.push(...findAll(test, n.children));
	}
	return out;
}

const BLOCK = /^(p|div|li|ul|ol|h[1-6]|pre|blockquote|tr|table|section)$/;

/** Text of an element, with blocks and `<br>` as line breaks and list items bulleted. */
function plainText(el: Element): string {
	let out = "";
	for (const c of el.children) {
		// Line breaks in text are kept (frontmatter notes); other runs of white space collapse.
		if (c.type === "text")
			out += (c as unknown as { data: string }).data.replace(/[ \t\f\r]+/g, " ");
		else if (isTag(c)) {
			if (c.name === "br") out += "\n";
			else if (BLOCK.test(c.name)) {
				const inner = plainText(c).trim();
				if (inner) out += `\n${c.name === "li" ? "• " : ""}${inner}\n`;
			} else out += plainText(c);
		}
	}
	return out
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.join("\n");
}

export async function exportPptx(deck: string, options: PptxOptions): Promise<void> {
	if (options.build !== false) {
		const { buildSite } = await import("../site-server");
		await buildSite(options.root);
	}
	const site = exportSiteDir(options.root);
	if (!site.own)
		console.log('  (using dist/: speaker notes only if it was built with notes: "public")');
	const dist = site.dir;
	const html = join(dist, deck, "all", "index.html");
	if (!existsSync(html)) throw new Error(`no print view at ${html}`);
	await pptxFromPrintView({
		html,
		site: dist,
		root: options.root,
		deck,
		config: await readDeckConfig(options.root, deck),
		output: options.output,
	});
}

/** The page's fonts loaded, and its ```mermaid diagrams drawn as pictures. */
async function pageWithDiagrams(engine: Engine, html: string, dist: string, root: string) {
	const options = { root };
	const fonts = new engine.FontRegistry();
	const css = engine.pageCss(html, dist);
	const { familiesIn } = engine;
	// The site's own fonts (KaTeX …) first; the rest from Google Fonts.
	const local = engine.loadFontFaces(fonts, css, dist);
	const missing = await engine.loadGoogleFonts(
		fonts,
		engine.familiesIn(css).filter((f) => !local.has(f)),
		join(options.root, "node_modules", ".cache", "astlide-fonts"),
	);
	if (missing.length) console.warn(`  ⚠ fonts not found on Google Fonts: ${missing.join(", ")}`);
	const emoji = "/System/Library/Fonts/Apple Color Emoji.ttc";
	if (existsSync(emoji)) fonts.addFallback(emoji);
	// East Asian text: named with the CSS's CJK font (else Yu Gothic, which Office has),
	// measured with that font when it was loaded, else Noto Sans JP.
	const eaFont = familiesIn(css).find((f) => CJK_FAMILY.test(f)) ?? DEFAULT_EA_FONT;
	if (CJK_TEXT.test(readFileSync(html, "utf-8"))) {
		const loaded = fonts.pick(`"${eaFont}"`, 400, false);
		const measure =
			loaded.family === eaFont.toLowerCase() && loaded.file
				? loaded.file
				: await googleFontFile(engine, "Noto Sans JP", options.root);
		if (measure) fonts.addFallback(measure);
		else console.warn("  ⚠ no Japanese font to measure text with (Noto Sans JP unavailable)");
	}

	const vp = { width: 1920, height: 1080, media: "screen" as const };
	const source = await withDiagrams(engine, readFileSync(html, "utf-8"), {
		root: options.root,
		// Labels in the slides' body font (the first slide's).
		font: () => {
			const [first] = engine.layoutPage(html, dist, fonts, vp);
			return fonts.pick(first?.style.get("font-family") ?? "sans-serif", 400, false);
		},
	});
	return { fonts, eaFont, source, vp };
}

/**
 * A print view with its ```mermaid diagrams drawn as pictures (with the
 * page's fonts), for exporters that render it without its scripts.
 */
export async function diagramsInPrintView(
	html: string,
	site: string,
	root: string,
): Promise<string> {
	const engine = await import("@astlide/core/engine");
	return (await pageWithDiagrams(engine, html, site, root)).source;
}

export interface PrintViewPptxOptions {
	/** The print view page (`<site>/<deck>/all/index.html`). */
	html: string;
	/** The site folder its root-relative URLs (styles, pictures) resolve in. */
	site: string;
	/** Where `mermaid` is resolved from and download caches live (`node_modules/.cache`). */
	root: string;
	deck: string;
	/** The deck's `_config.json` (title, author, theme). */
	config: Record<string, unknown>;
	output: string;
}

/**
 * A print view laid out into an editable PowerPoint file: from an Astro
 * build ({@link exportPptx}) or a page written without one (`renderDeck`).
 */
export async function pptxFromPrintView(o: PrintViewPptxOptions): Promise<void> {
	const engine = await import("@astlide/core/engine");
	const { html, site: dist, deck, config } = o;
	const options = { root: o.root, output: o.output };
	const { fonts, eaFont, source, vp } = await pageWithDiagrams(engine, html, dist, options.root);
	const layouts = engine.layoutPage(html, dist, fonts, vp, source);
	const notes = speakerNotes(source);

	const slides: SlideSpec[] = [];
	const used: TextItem[] = [];
	// Remote images (video thumbnails …) are fetched up front.
	const remote = new Map<string, "deck" | "remote">();
	const embedded = new Set<string>();
	for (const layout of layouts)
		for (const it of engine.toScene(layout, (eid) => layout.elements[eid]).items) {
			if (it.kind === "image" && /^https?:\/\//.test(it.src)) remote.set(it.src, "deck");
			if (it.kind === "embed" && /^https?:\/\//.test(it.src)) embedded.add(it.src);
		}
	// Everything this export downloads shares one budget: a few requests at a
	// time, a total size, and a number of distinct URLs.
	const budget = new FetchBudget();
	// Embedded pages of other sites: their title and thumbnail (oEmbed / Open Graph).
	const embeds = embedded.size
		? await resolveEmbeds(
				[...embedded],
				join(options.root, "node_modules", ".cache", "astlide-embeds"),
				budget,
			)
		: new Map<string, EmbedInfo>();
	// Thumbnails were chosen by the embedded pages: always public addresses only.
	for (const info of embeds.values())
		if (info.thumbnail && !remote.has(info.thumbnail)) remote.set(info.thumbnail, "remote");
	if (remote.size)
		await fetchImages(
			remote,
			join(options.root, "node_modules", ".cache", "astlide-images"),
			budget,
		);
	if (budget.refused.length)
		console.warn(
			`  ⚠ ${budget.refused.length} remote file(s) skipped (download limits reached): ${budget.refused.slice(0, 3).join(", ")}${budget.refused.length > 3 ? " …" : ""}`,
		);
	const bodyFace = fonts.pick(layouts[0]?.style.get("font-family") ?? "sans-serif", 400, false);
	layouts.forEach((layout, i) => {
		// Progress on one line: only where \r rewrites it (a terminal, not a log).
		if (process.stdout.isTTY) process.stdout.write(`  Slide ${i + 1}/${layouts.length}\r`);
		const scene = engine.toScene(layout, (eid) => layout.elements[eid]);
		const k = SLIDE_W_IN / scene.width;
		const elements: SlideElement[] = [];
		const blocks = new Map<number, TextItem[]>();
		const flowing = inlineHighlights(scene);
		const tables = layout.tables.map((t) => ({
			t,
			items: [] as TextItem[],
			frame: null as TableSpec | null,
		}));
		/** The table an item belongs to (its cells' boxes and text become the native table). */
		const tableOf = (x: number, y: number, w: number, h: number) =>
			tables.find(
				({ t }) =>
					x >= t.x - 0.5 && y >= t.y - 0.5 && x + w <= t.x + t.w + 0.5 && y + h <= t.y + t.h + 0.5,
			);
		const claim = (entry: (typeof tables)[number]) => {
			if (entry.frame) return;
			entry.frame = { type: "table", x: 0, y: 0, w: 0, h: 0, columns: [], rows: [] };
			elements.push(entry.frame);
		};
		for (const raw of scene.items) {
			// Clipping (ancestors' overflow): what's outside doesn't show.
			const clip = raw.clip;
			if (clip) {
				const seen = engine.intersect(raw, clip);
				if (seen.w <= 0.5 || seen.h <= 0.5) continue;
				if (raw.kind === "text") {
					const cx = raw.x + raw.w / 2;
					const cy = raw.y + raw.h / 2;
					if (cx < clip.x || cx > clip.x + clip.w || cy < clip.y || cy > clip.y + clip.h) continue;
				}
			}
			// A clipped box is drawn as its visible part.
			const item = raw.kind === "rect" && clip ? { ...raw, ...engine.intersect(raw, clip) } : raw;
			if (item.kind === "text") used.push(item);
			if (item.kind !== "image") {
				const entry =
					item.kind === "text"
						? tableOf(item.x + item.w / 2, item.y + item.h / 2, 0, 0)
						: tableOf(item.x, item.y, item.w, item.h);
				if (entry) {
					claim(entry);
					if (item.kind === "text") entry.items.push(item);
					continue;
				}
			}
			if (item.kind === "rect") {
				if (flowing.has(item)) continue;
				elements.push({
					type: "rect",
					x: item.x * k,
					y: item.y * k,
					w: item.w * k,
					h: item.h * k,
					fill: item.fill ? hex(item.fill) : "FFFFFF",
					noFill: !item.fill,
					fillTransparency: item.fill ? Math.round((1 - item.fill.alpha) * 100) : undefined,
					line: item.border
						? {
								color: hex(item.border.color),
								width: item.border.width * k * 72,
								transparency: Math.round((1 - item.border.color.alpha) * 100),
							}
						: undefined,
					radius: item.radius ? item.radius * k : undefined,
					pattern: item.stripes && {
						preset: stripePreset(item.stripes.angle, item.stripes.period),
						color: hex(item.stripes.color),
						transparency: Math.round((1 - item.stripes.color.alpha) * 100),
					},
					gradient: item.gradient && {
						angle: item.gradient.angle,
						stops: item.gradient.stops.map((s) => ({
							color: hex(s.color),
							transparency: Math.round((1 - s.color.alpha) * 100),
							pos: s.pos,
						})),
					},
				});
			} else if (item.kind === "text") {
				// Text in a block goes in one text box (below); markers stand alone.
				if (item.block) {
					const group = blocks.get(item.block.id) ?? [];
					if (group.length === 0) {
						blocks.set(item.block.id, group);
						// Keep the paint position of the block's first text.
						elements.push(blockBox(group));
					}
					group.push(item);
					continue;
				}
				elements.push({
					type: "textbox",
					runs: [{ text: item.text, options: runOptions(item, k) }],
					x: item.x * k,
					y: item.y * k,
					// PowerPoint's glyph widths differ slightly; the text never wraps.
					w: item.w * k * 1.1 + 0.05,
					h: item.h * k,
					valign: "middle",
					wrap: false,
					inset: 0,
				});
			} else if (item.kind === "svg") {
				const face = fonts.pick(item.fontFamily, 400, false);
				const root = engine.parseMarkup(item.markup).children.find((c) => c.type === "tag");
				const shapes = root
					? svgToShapes(
							root as SvgNode,
							{
								x: item.x,
								y: item.y,
								w: item.w,
								h: item.h,
								color: hex(item.color),
								fontFace: fontFor(face.font.familyName, 400).face,
								fontSize: item.fontSize,
							},
							k,
						)
					: null;
				if (shapes) elements.push(...shapes);
				else {
					// Not expressible as shapes: a picture of it.
					const svg = rasterReady(item.markup, hex(item.color));
					const data = svgPicture(engine, svg, item.w * RASTER_SCALE, fonts.files());
					if (data)
						elements.push({
							type: "image",
							x: item.x * k,
							y: item.y * k,
							w: item.w * k,
							h: item.h * k,
							data,
						});
				}
			} else if (item.kind === "embed") {
				elements.push(
					...embedCard(item, fontFor(bodyFace.font.familyName, 400).face, k, embeds.get(item.src)),
				);
			} else if (item.kind === "image") {
				const source = imageSource(item.src, dist, engine.distFile);
				// Background images and object-fit: placed by size / position and clipped to the box.
				const place = source && item.fit ? placeBackground(item, item.fit, source.size) : null;
				const drawn = place?.drawn ?? { x: item.x, y: item.y, w: item.w, h: item.h };
				// The part that shows: inside the box (fit) and the clip.
				let visible = place?.visible ?? drawn;
				if (clip) visible = engine.intersect(visible, clip);
				const bytes =
					source && (!item.fit || place) && visible.w > 0 && visible.h > 0
						? rasterize(engine, source, drawn.w, fonts.files())
						: null;
				const format = source && "bitmap" in source ? source.format : "png";
				const link = item.href && /^https?:/.test(item.href) ? item.href : undefined;
				if (bytes) {
					const cropped =
						visible.x > drawn.x + 0.5 ||
						visible.y > drawn.y + 0.5 ||
						visible.w < drawn.w - 0.5 ||
						visible.h < drawn.h - 0.5;
					elements.push({
						type: "image",
						x: visible.x * k,
						y: visible.y * k,
						w: visible.w * k,
						h: visible.h * k,
						data: bytes,
						format,
						crop: cropped
							? {
									left: (visible.x - drawn.x) / drawn.w,
									top: (visible.y - drawn.y) / drawn.h,
									right: (drawn.x + drawn.w - visible.x - visible.w) / drawn.w,
									bottom: (drawn.y + drawn.h - visible.y - visible.h) / drawn.h,
								}
							: undefined,
						link,
					});
				} else if (!source && !/^https?:/.test(item.src)) {
					const name = item.src.startsWith("data:") ? item.src.slice(0, 30) : item.src;
					console.warn(`\n  ⚠ slide ${i + 1}: image ${name} skipped (PNG / SVG only for now)`);
				}
			}
		}
		for (const { t, items, frame } of tables)
			if (frame) Object.assign(frame, tableSpec(engine, t, items, layout.boxes, k));
		// Fill in the block text boxes now that every line is known.
		for (const [n, el] of elements.entries()) {
			if (el.type === "textbox" && el.runs.length === 0) {
				const group = [...blocks.values()].find((g) => g.length && boxOf.get(g) === el);
				if (group) elements[n] = fillBlock(el, group, k);
			}
		}
		// A transparent slide shows the (white) page behind it.
		const background = scene.background.alpha > 0 ? hex(scene.background) : "FFFFFF";
		slides.push({ background, elements, notes: notes[i] });
	});
	if (process.stdout.isTTY) console.log("");
	console.log(`  ${layouts.length} slides`);
	const pptx = new PptxFile({
		title: str(config.title) ?? deck,
		author: str(config.author) ?? "",
		theme: getTheme(str(config.theme)),
		fonts: embeddedFonts(used),
		eaFont,
	});
	for (const slide of slides) pptx.addSlide(slide);
	await mkdir(dirname(options.output), { recursive: true });
	await pptx.save(options.output);
	console.log(`  ✓ Saved to ${options.output}`);
}
