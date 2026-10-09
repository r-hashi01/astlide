/**
 * PPTX export: the built print view (`/<deck>/all`) is laid out by
 * @astlide/engine — CSS cascade, flexbox and font-metric line breaking, no
 * browser — and each slide's paint items become native PowerPoint shapes,
 * text boxes and pictures.
 *
 * @module
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SceneItem } from "@astlide/engine";
import {
	PptxFile,
	type SlideElement,
	type TextBoxSpec,
	type TextRun,
	type TextRunOptions,
} from "./ooxml-writer";
import { getTheme } from "./theme-map";

export interface PptxOptions {
	/** Project root (built into <root>/dist). */
	root: string;
	output: string;
	/** Skip `astro build` and use the existing dist/. */
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

function runOptions(item: TextItem, k: number): TextRunOptions {
	const f = fontFor(item.font.family, item.font.weight);
	return {
		fontSize: item.font.size * k * 72,
		color: hex(item.color),
		fontFace: f.face,
		bold: f.bold,
		italic: item.font.italic,
		letterSpacing: item.letterSpacing ? item.letterSpacing * k * 72 : undefined,
	};
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
	const block = group[0]?.block;
	if (!block) return box;
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
	// The last paragraph ends the text: no trailing empty paragraph.
	return {
		...box,
		runs,
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

export async function exportPptx(deck: string, options: PptxOptions): Promise<void> {
	const engine = await import("@astlide/engine");
	if (options.build !== false) {
		const { buildSite } = await import("../site-server");
		await buildSite(options.root);
	}
	const dist = join(options.root, "dist");
	const html = join(dist, deck, "all", "index.html");
	if (!existsSync(html)) throw new Error(`no print view at ${html}`);

	const fonts = new engine.FontRegistry();
	const families = engine.familiesIn(engine.pageCss(html, dist));
	const missing = await engine.loadGoogleFonts(
		fonts,
		families,
		join(options.root, "node_modules", ".cache", "astlide-fonts"),
	);
	if (missing.length) console.warn(`  ⚠ fonts not found on Google Fonts: ${missing.join(", ")}`);
	const emoji = "/System/Library/Fonts/Apple Color Emoji.ttc";
	if (existsSync(emoji)) fonts.addFallback(emoji);

	const vp = { width: 1920, height: 1080, media: "screen" as const };
	const layouts = engine.layoutPage(html, dist, fonts, vp);

	const config = await readDeckConfig(options.root, deck);
	const pptx = new PptxFile({
		title: str(config.title) ?? deck,
		author: str(config.author) ?? "",
		theme: getTheme(str(config.theme)),
	});
	layouts.forEach((layout, i) => {
		process.stdout.write(`  Slide ${i + 1}/${layouts.length}\r`);
		const scene = engine.toScene(layout, (eid) => layout.elements[eid]);
		const k = SLIDE_W_IN / scene.width;
		const elements: SlideElement[] = [];
		const blocks = new Map<number, TextItem[]>();
		for (const item of scene.items) {
			if (item.kind === "rect") {
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
			} else if (item.kind === "image") {
				const path = [join(dist, item.src), join(dist, item.src.replace(/^\/[^/]+/, ""))].find(
					(p) => existsSync(p),
				);
				if (path?.endsWith(".png")) {
					elements.push({
						type: "image",
						x: item.x * k,
						y: item.y * k,
						w: item.w * k,
						h: item.h * k,
						png: readFileSync(path),
					});
				} else {
					console.warn(`\n  ⚠ slide ${i + 1}: image ${item.src} skipped (only PNG for now)`);
				}
			}
		}
		// Fill in the block text boxes now that every line is known.
		for (const [n, el] of elements.entries()) {
			if (el.type === "textbox" && el.runs.length === 0) {
				const group = [...blocks.values()].find((g) => g.length && boxOf.get(g) === el);
				if (group) elements[n] = fillBlock(el, group, k);
			}
		}
		pptx.addSlide({ background: hex(scene.background), elements });
	});
	console.log("");
	await mkdir(dirname(options.output), { recursive: true });
	await pptx.save(options.output);
	console.log(`  ✓ Saved to ${options.output}`);
}
