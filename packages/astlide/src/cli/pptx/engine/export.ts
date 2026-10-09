/**
 * Engine-based PPTX export (experimental): the built print view is laid out
 * by @astlide/engine — CSS cascade, flexbox and font-metric line breaking,
 * no browser — and each slide's paint items become native PowerPoint
 * shapes, text boxes and pictures.
 *
 * @module
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PptxFile, type SlideElement } from "../ooxml-writer";
import { getTheme } from "../theme-map";

export interface EnginePptxOptions {
	/** Project root (built into <root>/dist). */
	root: string;
	output: string;
	/** Skip `astro build` and use the existing dist/. */
	build?: boolean;
	title?: string;
	author?: string;
	theme?: string;
}

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
	return { face: name ? `${family} ${name}` : family, bold: false };
}

const hex = (c: { hex: string }) => c.hex.toUpperCase();

export async function exportEnginePptx(deck: string, options: EnginePptxOptions): Promise<void> {
	const engine = await import("@astlide/engine").catch(() => {
		throw new Error(
			"--pptx-engine needs the @astlide/engine workspace package (experimental, repo only)",
		);
	});
	if (options.build !== false) {
		const { buildSite } = await import("../../site-server");
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

	const pptx = new PptxFile({
		title: options.title ?? deck,
		author: options.author ?? "",
		theme: getTheme(options.theme),
	});
	layouts.forEach((layout, i) => {
		process.stdout.write(`  Slide ${i + 1}/${layouts.length}\r`);
		const scene = engine.toScene(layout, (eid) => layout.elements[eid]);
		const k = SLIDE_W_IN / scene.width;
		const elements: SlideElement[] = [];
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
				const f = fontFor(item.font.family, item.font.weight);
				elements.push({
					type: "textbox",
					runs: [
						{
							text: item.text,
							options: {
								fontSize: item.font.size * k * 72,
								color: hex(item.color),
								fontFace: f.face,
								bold: f.bold,
								italic: item.font.italic,
								letterSpacing: item.letterSpacing ? item.letterSpacing * k * 72 : undefined,
							},
						},
					],
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
		pptx.addSlide({ background: hex(scene.background), elements });
	});
	console.log("");
	await mkdir(dirname(options.output), { recursive: true });
	await pptx.save(options.output);
	console.log(`  ✓ Saved to ${options.output}`);
}
