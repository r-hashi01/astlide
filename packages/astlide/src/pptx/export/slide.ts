/**
 * One laid-out slide as a SlideSpec: boxes, text, tables, SVG, pictures and
 * embeds in paint order.
 *
 * @module
 */

import type { FontRegistry } from "@astlide/core/engine";
import { type Engine, hex, type TextItem, type Warn } from "./common";
import { rasterReady } from "./diagrams";
import { embedCard } from "./embed-card";
import type { EmbedInfo } from "./embeds";
import { fontFor } from "./fonts";
import {
	imageSource,
	placeBackground,
	RASTER_SCALE,
	type RemoteImages,
	rasterize,
	svgPicture,
} from "./images";
import { type SvgNode, svgToShapes } from "./svg-shapes";
import { tableSpec } from "./table";
import { blockBox, boxOf, fillBlock, inlineHighlights, runOptions } from "./text";
import type { SlideElement, SlideSpec, TableSpec } from "./writer/spec";

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

/** The slide's width in PowerPoint, in inches (positions are scaled to it). */
const SLIDE_W_IN = 10;

/** What a slide's conversion needs from the whole export. */
export interface SlideContext {
	/** The site folder root-relative URLs resolve in. */
	dist: string;
	fonts: FontRegistry;
	remoteImages: RemoteImages;
	embeds: Map<string, EmbedInfo>;
	/** The slides' body font (embed cards). */
	bodyFace: ReturnType<FontRegistry["pick"]>;
	/** Text items drawn so far (their fonts get embedded); this slide's are added. */
	used: TextItem[];
	warn: Warn;
	notes: string | undefined;
}

/** Slide `i` (0-based) of the layout as a SlideSpec. */
export function slideSpec(
	engine: Engine,
	layout: ReturnType<Engine["layoutPage"]>[number],
	i: number,
	{ dist, fonts, remoteImages, embeds, bodyFace, used, warn, notes }: SlideContext,
): SlideSpec {
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
				const data = svgPicture(engine, svg, item.w * RASTER_SCALE, fonts.files(), warn);
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
				...embedCard(
					item,
					fontFor(bodyFace.font.familyName, 400).face,
					k,
					remoteImages,
					embeds.get(item.src),
				),
			);
		} else if (item.kind === "image") {
			const source = imageSource(item.src, dist, engine.distFile, remoteImages);
			// Background images and object-fit: placed by size / position and clipped to the box.
			const place = source && item.fit ? placeBackground(item, item.fit, source.size) : null;
			const drawn = place?.drawn ?? { x: item.x, y: item.y, w: item.w, h: item.h };
			// The part that shows: inside the box (fit) and the clip.
			let visible = place?.visible ?? drawn;
			if (clip) visible = engine.intersect(visible, clip);
			const bytes =
				source && (!item.fit || place) && visible.w > 0 && visible.h > 0
					? rasterize(engine, source, drawn.w, fonts.files(), warn)
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
				warn(`\n  ⚠ slide ${i + 1}: image ${name} skipped (PNG / SVG only for now)`);
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
	return { background, elements, notes };
}
