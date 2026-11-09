/**
 * The print view's fonts loaded and its ```mermaid diagrams drawn as pictures,
 * without a browser.
 *
 * @module
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mermaidThemeFor } from "@astlide/core/utils/mermaid";
import { consoleReporter, type Reporter } from "@astlide/core/utils/reporter";
import type { Engine, Warn } from "./common";

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
export function rasterReady(markup: string, color: string): string {
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
		warn: Warn;
	},
): Promise<string> {
	const blocks = [...html.matchAll(/<pre class="astlide-mermaid"[^>]*>([\s\S]*?)<\/pre>/g)];
	if (blocks.length === 0) return html;
	const mermaidPath = engine.resolveEsm("mermaid", options.root);
	if (!mermaidPath) {
		options.warn("  ⚠ diagrams skipped: install `mermaid` in the project to export them");
		return html;
	}
	const face = options.font();
	if (!face.file) {
		options.warn("  ⚠ diagrams skipped: no font file for their labels");
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

/** The page's fonts loaded, and its ```mermaid diagrams drawn as pictures. */
export async function pageWithDiagrams(
	engine: Engine,
	html: string,
	dist: string,
	root: string,
	warn: Warn,
) {
	const options = { root };
	const css = engine.pageCss(html, dist);
	const { fonts, eaFont, missing, noCjkFont } = await engine.loadPageFonts(
		html,
		css,
		dist,
		join(options.root, "node_modules", ".cache", "astlide-fonts"),
	);
	if (missing.length) warn(`  ⚠ fonts not found on Google Fonts: ${missing.join(", ")}`);
	if (noCjkFont) warn("  ⚠ no Japanese font to measure text with (Noto Sans JP unavailable)");

	const vp = { width: 1920, height: 1080, media: "screen" as const };
	const source = await withDiagrams(engine, readFileSync(html, "utf-8"), {
		root: options.root,
		// Labels in the slides' body font (the first slide's).
		font: () => {
			const [first] = engine.layoutPage(html, dist, fonts, vp);
			return fonts.pick(first?.style.get("font-family") ?? "sans-serif", 400, false);
		},
		warn,
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
	reporter: Reporter = consoleReporter,
): Promise<string> {
	const engine = await import("@astlide/core/engine");
	return (await pageWithDiagrams(engine, html, site, root, reporter.warn)).source;
}
