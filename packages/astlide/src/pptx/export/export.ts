/**
 * PPTX export: the built print view (`/<deck>/all`) is laid out by the
 * layout engine (`@astlide/core/engine`) — CSS cascade, flexbox and
 * font-metric line breaking, no browser — and each slide's paint items become
 * native PowerPoint shapes, text boxes and pictures (`slide`), written by
 * `ooxml-writer`. This module runs the export: fonts and diagrams, downloads,
 * the slides and the file.
 *
 * @module
 */

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FetchBudget } from "@astlide/core/utils/network";
import { consoleReporter, type Reporter } from "@astlide/core/utils/reporter";
import type { TextItem } from "./common";
import { pageWithDiagrams } from "./diagrams";
import { type EmbedInfo, resolveEmbeds } from "./embeds";
import { embeddedFonts } from "./fonts";
import { fetchImages, type RemoteImages } from "./images";
import { speakerNotes } from "./notes";
import { PptxFile } from "./ooxml-writer";
import { slideSpec } from "./slide";
import { themeColors } from "./theme-map";
import type { SlideSpec } from "./writer/spec";

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

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
	/** Where progress, results and warnings go (default: the console). */
	reporter?: Reporter;
}

/**
 * A print view laid out into an editable PowerPoint file: from an Astro
 * build ({@link exportPptx}) or a page written without one (`renderDeck`).
 */
export async function pptxFromPrintView(o: PrintViewPptxOptions): Promise<void> {
	const engine = await import("@astlide/core/engine");
	const { html, site: dist, deck, config } = o;
	const options = { root: o.root, output: o.output };
	const reporter = o.reporter ?? consoleReporter;
	const warn = reporter.warn;
	const { fonts, eaFont, source, vp } = await pageWithDiagrams(
		engine,
		html,
		dist,
		options.root,
		warn,
	);
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
	const remoteImages: RemoteImages = remote.size
		? await fetchImages(
				remote,
				join(options.root, "node_modules", ".cache", "astlide-images"),
				budget,
				warn,
			)
		: new Map();
	if (budget.refused.length)
		warn(
			`  ⚠ ${budget.refused.length} remote file(s) skipped (download limits reached): ${budget.refused.slice(0, 3).join(", ")}${budget.refused.length > 3 ? " …" : ""}`,
		);
	const bodyFace = fonts.pick(layouts[0]?.style.get("font-family") ?? "sans-serif", 400, false);
	layouts.forEach((layout, i) => {
		reporter.progress(`  Slide ${i + 1}/${layouts.length}`);
		slides.push(
			slideSpec(engine, layout, i, {
				dist,
				fonts,
				remoteImages,
				embeds,
				bodyFace,
				used,
				warn,
				notes: notes[i],
			}),
		);
	});
	reporter.progressEnd();
	reporter.info(`  ${layouts.length} slides`);
	const pptx = new PptxFile({
		title: str(config.title) ?? deck,
		author: str(config.author) ?? "",
		// The theme as the deck applied it (built-in, template or plugin): its CSS variables.
		theme: themeColors(layouts[0]?.style),
		fonts: embeddedFonts(used, warn),
		eaFont,
	});
	for (const slide of slides) pptx.addSlide(slide);
	await mkdir(dirname(options.output), { recursive: true });
	await pptx.save(options.output);
	reporter.info(`  ✓ Saved to ${options.output}`);
}
