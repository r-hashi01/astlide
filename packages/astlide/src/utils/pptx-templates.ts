/**
 * PowerPoint templates as themes (`astlide({ templates })`): each template
 * file is read into theme CSS (written to a cache file, imported like any
 * theme's) and per-layout artwork (served to `Slide.astro` through
 * `virtual:astlide/templates`). In dev, editing a template reloads the deck.
 *
 * @module
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { pptxToTemplate, templateCss } from "../pptx/template";
import type { TemplateStore } from "../templates/store";
import { pptxAssetDir, referencedAssets, storePptxAsset } from "./pptx-assets";
import { slideScriptsKept, stripSlideScripts } from "./slide-scripts";

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
	// A template can come from someone else, like a slide: no scripts in its artwork.
	const art = (html: string) => (slideScriptsKept() ? html : stripSlideScripts(html));
	return {
		theme,
		source: file,
		cssPath,
		data: {
			layouts: Object.fromEntries(
				template.layouts.map((l) => [l.id, { art: art(l.art), slideNumber: !!l.slideNumber }]),
			),
			aliases: template.aliases,
			master: art(template.master),
		},
	};
}

/**
 * Every template in `store` (its latest version), downloaded into the cache:
 * theme name → file, ready for {@link loadTemplate}.
 */
export async function storedTemplateFiles(
	store: TemplateStore,
	root: string,
): Promise<[theme: string, file: string][]> {
	const dir = join(root, "node_modules", ".astro", "astlide-templates", "store");
	await mkdir(dir, { recursive: true });
	const files: [string, string][] = [];
	for (const { name } of await store.list()) {
		const stored = await store.get(name);
		if (!stored) continue; // removed while listing
		const file = join(dir, `${name}${stored.version.ext}`);
		await writeFile(file, stored.data);
		files.push([name, file]);
	}
	return files;
}

const VIRTUAL_ID = "virtual:astlide/templates";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * Serves `virtual:astlide/templates`; in dev, re-reads a template when its
 * file changes, and restarts the server when a template in `storeDir` (a
 * folder template store) is added, replaced or removed.
 */
export function astlideTemplatesPlugin(
	templates: LoadedTemplate[],
	reload: (t: LoadedTemplate) => LoadedTemplate,
	storeDir?: string,
): Plugin {
	return {
		name: "astlide:templates",
		resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
		load(id) {
			if (id !== RESOLVED_ID) return null;
			const data = Object.fromEntries(templates.map((t) => [t.theme, t.data]));
			// Assets the theme CSS uses (fonts), so the build publishes them (see internal/pages/pptx-asset).
			const assets = templates.flatMap((t) =>
				existsSync(t.cssPath) ? referencedAssets(readFileSync(t.cssPath, "utf-8")) : [],
			);
			return (
				`export const templates = ${JSON.stringify(data)};\n` +
				`export const templateAssets = ${JSON.stringify([...new Set(assets)])};\n`
			);
		},
		configureServer(server: ViteDevServer) {
			if (storeDir) {
				server.watcher.add(storeDir);
				let timer: ReturnType<typeof setTimeout> | undefined;
				const changed = (file: string) => {
					if (!file.startsWith(storeDir) || !file.endsWith("manifest.json")) return;
					// A store writes several files per change: restart once they're in.
					clearTimeout(timer);
					timer = setTimeout(() => {
						server.config.logger.info("[astlide] template store changed: restarting");
						void server.restart();
					}, 200);
				};
				for (const event of ["add", "change", "unlink"] as const) server.watcher.on(event, changed);
			}
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
