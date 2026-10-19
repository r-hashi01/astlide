/**
 * PowerPoint templates as themes (`astlide({ templates })`): each template
 * file is read into theme CSS (written to a cache file, imported like any
 * theme's) and per-layout artwork (served to `Slide.astro` through
 * `virtual:astlide/templates`). In dev, editing a template reloads the deck.
 *
 * @module
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { pptxToTemplate, templateCss } from "../pptx/template";
import { pptxAssetDir, storePptxAsset } from "./pptx-assets";

/** What a slide needs at render time: artwork per layout, aliases, the master's art. */
export interface TemplateData {
	layouts: Record<string, { art: string; slideNumber: boolean }>;
	aliases: Record<string, string>;
	master: string;
}

export interface LoadedTemplate {
	theme: string;
	/** The template file (absolute). */
	source: string;
	/** The generated theme CSS file (absolute). */
	cssPath: string;
	data: TemplateData;
}

/** Read a template, write its theme CSS and pictures to the cache. */
export function loadTemplate(
	theme: string,
	source: string,
	root: string,
	base: string,
): LoadedTemplate {
	const file = resolve(root, source);
	const assets = pptxAssetDir(root);
	const template = pptxToTemplate(readFileSync(file), {
		media: (f) => storePptxAsset(assets, base, f),
	});
	const dir = join(root, "node_modules", ".astro", "astlide-templates");
	mkdirSync(dir, { recursive: true });
	const cssPath = join(dir, `${theme.replace(/[^\w-]/g, "_")}.css`);
	writeFileSync(cssPath, `${templateCss(template, theme)}\n`);
	return {
		theme,
		source: file,
		cssPath,
		data: {
			layouts: Object.fromEntries(
				template.layouts.map((l) => [l.id, { art: l.art, slideNumber: !!l.slideNumber }]),
			),
			aliases: template.aliases,
			master: template.master,
		},
	};
}

const VIRTUAL_ID = "virtual:astlide/templates";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/** Serves `virtual:astlide/templates`; in dev, re-reads a template when its file changes. */
export function astlideTemplatesPlugin(
	templates: LoadedTemplate[],
	reload: (t: LoadedTemplate) => LoadedTemplate,
): Plugin {
	return {
		name: "astlide:templates",
		resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
		load(id) {
			if (id !== RESOLVED_ID) return null;
			const data = Object.fromEntries(templates.map((t) => [t.theme, t.data]));
			return `export const templates = ${JSON.stringify(data)};\n`;
		},
		configureServer(server: ViteDevServer) {
			if (!templates.length) return;
			server.watcher.add(templates.map((t) => t.source));
			server.watcher.on("change", (file) => {
				const i = templates.findIndex((t) => t.source === file);
				const current = templates[i];
				if (!current) return;
				try {
					templates[i] = reload(current);
				} catch (e) {
					server.config.logger.error(`[astlide] ${file}: ${(e as Error).message}`);
					return;
				}
				for (const mod of [
					server.moduleGraph.getModuleById(RESOLVED_ID),
					...(server.moduleGraph.getModulesByFile(current.cssPath) ?? []),
				])
					if (mod) server.moduleGraph.invalidateModule(mod);
				server.ws.send({ type: "full-reload" });
			});
		},
	};
}
