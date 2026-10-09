/// <reference path="./svgdom.d.ts" />
/**
 * Diagrams without a browser: Mermaid renders against a server-side SVG DOM
 * (svgdom, which measures text with the given font file), and SVG becomes
 * PNG with resvg.
 *
 * Mermaid itself is the project's own (optional) install, passed in by path,
 * so diagrams match the version the slides use in the browser.
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { JSDOM } from "jsdom";
import { createHTMLWindow, config as svgdomConfig } from "svgdom";

export interface RenderedDiagram {
	svg: string;
	/** Natural size in CSS px (Mermaid's `max-width` and aspect ratio). */
	width: number;
	height: number;
}

export interface MermaidOptions {
	/** Mermaid's entry module (resolved from the project). */
	mermaidPath: string;
	/** Mermaid theme (`default`, `dark`, `forest` …). */
	theme: string;
	/** Family the labels are set in, and the font file that measures them. */
	fontFamily: string;
	fontFile: string;
}

interface Mermaid {
	initialize(config: Record<string, unknown>): void;
	render(id: string, text: string): Promise<{ svg: string }>;
}

/** Mermaid's px font size; x / y / dy given in em are relative to it. */
const MERMAID_FONT_PX = 16;

/**
 * svgdom reads `x` / `y` / `dx` / `dy` as px, so Mermaid's `dy="1.1em"`
 * would count as 1.1px and multi-line labels measure one line tall. Store
 * em lengths as px as they're set.
 */
function emPositionsAsPx(win: { document: { createElementNS(ns: string, n: string): object } }) {
	let proto = Object.getPrototypeOf(
		win.document.createElementNS("http://www.w3.org/2000/svg", "text"),
	);
	while (proto && !Object.hasOwn(proto, "setAttribute")) proto = Object.getPrototypeOf(proto);
	const set = proto.setAttribute as (this: unknown, name: string, value: unknown) => void;
	proto.setAttribute = function (this: unknown, name: string, value: unknown) {
		if (/^d?[xy]$/.test(name) && typeof value === "string" && /em\s*$/.test(value))
			value = value
				.trim()
				.split(/[\s,]+/)
				.map((v) => (v.endsWith("em") ? String(Number.parseFloat(v) * MERMAID_FONT_PX) : v))
				.join(" ");
		set.call(this, name, value);
	};
}

/**
 * Render Mermaid sources to SVG. A source that fails to parse gives `null`
 * (and is logged), like a diagram the browser can't render.
 */
export async function renderMermaid(
	sources: string[],
	options: MermaidOptions,
): Promise<(RenderedDiagram | null)[]> {
	const g = globalThis as Record<string, unknown>;
	const saved = { window: g.window, document: g.document, CSSStyleSheet: g.CSSStyleSheet };
	const family = options.fontFamily.toLowerCase();
	svgdomConfig
		.setFontDir(dirname(options.fontFile))
		.setFontFamilyMappings(
			Object.fromEntries(
				[family, "trebuchet ms", "verdana", "arial", "sans-serif"].map((f) => [
					f,
					basename(options.fontFile),
				]),
			),
		)
		.preloadFonts();
	const win = createHTMLWindow() as unknown as Record<string, unknown> & {
		document: { createElementNS(ns: string, n: string): object };
	};
	// Mermaid's bundled layout code (ELK) reaches for globals through `window`.
	for (const key of Object.getOwnPropertyNames(globalThis)) {
		if (key in win) continue;
		try {
			win[key] = g[key];
		} catch {}
	}
	emPositionsAsPx(win);
	const jsdom = new JSDOM("").window;
	try {
		Object.assign(g, { window: win, document: win.document, CSSStyleSheet: jsdom.CSSStyleSheet });
		// DOMPurify (Mermaid's own copy) needs a full DOM: give it jsdom's.
		const purifyPath = resolveEsm("dompurify", dirname(options.mermaidPath));
		if (!purifyPath) throw new Error("dompurify (a dependency of mermaid) not found");
		const purify = (await import(purifyPath)).default as ((w: unknown) => object) & object;
		Object.assign(purify, purify(jsdom));
		const mermaid = (await import(options.mermaidPath)).default as Mermaid;
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: "strict",
			theme: options.theme,
			fontFamily: `"${options.fontFamily}", sans-serif`,
			// SVG text, not HTML in <foreignObject>: resvg and PowerPoint can draw it.
			htmlLabels: false,
			flowchart: { htmlLabels: false },
		});
		const out: (RenderedDiagram | null)[] = [];
		for (const [i, source] of sources.entries()) {
			try {
				const { svg } = await mermaid.render(`astlide-diagram-${i + 1}`, source);
				out.push({ svg, ...naturalSize(svg) });
			} catch (error) {
				console.warn(`  ⚠ diagram ${i + 1}: ${error instanceof Error ? error.message : error}`);
				out.push(null);
			}
		}
		return out;
	} finally {
		Object.assign(g, saved);
		jsdom.close();
	}
}

/**
 * The ES module entry of package `name` as Node resolves it from `fromDir`
 * (walking up node_modules), or null when it isn't installed.
 */
export function resolveEsm(name: string, fromDir: string): string | null {
	for (let dir = resolve(fromDir); ; dir = dirname(dir)) {
		const pkgDir = join(dir, "node_modules", name);
		const pkgFile = join(pkgDir, "package.json");
		if (existsSync(pkgFile)) {
			const pkg = JSON.parse(readFileSync(pkgFile, "utf-8")) as {
				exports?: Record<string, unknown>;
				module?: string;
				main?: string;
			};
			const root = pkg.exports?.["."] as Record<string, unknown> | string | undefined;
			const pick = (v: unknown): string | undefined =>
				typeof v === "string"
					? v
					: v && typeof v === "object"
						? pick((v as Record<string, unknown>).import ?? (v as Record<string, unknown>).default)
						: undefined;
			const entry = pick(root) ?? pkg.module ?? pkg.main ?? "index.js";
			return join(pkgDir, entry);
		}
		if (dirname(dir) === dir) return null;
	}
}

/** Mermaid sizes its SVG by `style="max-width: Wpx"` plus the viewBox's ratio. */
function naturalSize(svg: string): { width: number; height: number } {
	const view = svg.match(/viewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/);
	const vw = Number(view?.[1] ?? 0);
	const vh = Number(view?.[2] ?? 0);
	const max = Number(svg.match(/max-width:\s*([\d.]+)px/)?.[1] ?? vw);
	const width = max || vw || 300;
	return { width, height: vw ? (width * vh) / vw : 150 };
}

/** Rasterize SVG to PNG `width` px wide, drawing text with `fontFiles`. */
export function svgToPng(svg: string, width: number, fontFiles: string[]): Buffer {
	return new Resvg(svg, {
		fitTo: { mode: "width", value: Math.round(width) },
		font: { fontFiles, loadSystemFonts: false },
	})
		.render()
		.asPng();
}
