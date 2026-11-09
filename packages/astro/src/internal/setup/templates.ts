/**
 * The `templates` option: PowerPoint templates (files, or a template store)
 * loaded into themes and registered with the resolved plugins.
 *
 * @module
 */

import { resolve } from "node:path";
import type { AstlideOptions } from "@astlide/astro";
import {
	type LoadedTemplate,
	loadTemplate,
	storedTemplateFiles,
} from "@astlide/astro/internal/pptx-templates";
import type { ResolvedPlugins } from "@astlide/core/plugin";
import { openTemplateStore, type TemplateStore } from "@astlide/core/templates";

const isStore = (value: unknown): value is TemplateStore =>
	typeof (value as TemplateStore | undefined)?.list === "function" &&
	typeof (value as TemplateStore).get === "function";

/** The template store the `templates` option names, if it names one. */
function templateStoreOf(
	option: AstlideOptions["templates"],
	root: string,
): { store: TemplateStore; storeDir?: string; label: string } | undefined {
	if (isStore(option)) return { store: option, label: "template store" };
	if (typeof option !== "string") return undefined;
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(option))
		return { store: openTemplateStore(option), label: `template store ${option}` };
	const storeDir = resolve(root, option);
	return { store: openTemplateStore(storeDir), storeDir, label: `template store ${option}` };
}

/** Every stored template downloaded into the cache: theme name → file. */
async function storedSources(
	stored: { store: TemplateStore; label: string },
	root: string,
): Promise<[string, string][]> {
	try {
		return await storedTemplateFiles(stored.store, root);
	} catch (e) {
		throw new Error(`[astlide] ${stored.label}: ${(e as Error).message}`);
	}
}

export interface Templates {
	templates: LoadedTemplate[];
	/** Load a template again (when its file changes in dev). */
	reload(t: LoadedTemplate): LoadedTemplate;
	/** The local template store's folder, watched in dev. */
	storeDir?: string;
}

/**
 * PowerPoint templates → themes (CSS from the cache) and their layout names,
 * added to `resolved`. A promise only with a template store, which is read
 * now: without one, the setup hook stays synchronous.
 */
export function loadTemplates(
	options: AstlideOptions,
	place: { root: string; base: string },
	resolved: ResolvedPlugins,
): Templates | Promise<Templates> {
	const stored = templateStoreOf(options.templates, place.root);
	if (!stored)
		return register(
			options,
			place,
			resolved,
			Object.entries((options.templates ?? {}) as Record<string, string>),
		);
	return storedSources(stored, place.root).then((sources) => ({
		...register(options, place, resolved, sources),
		storeDir: stored.storeDir,
	}));
}

/** Load each template (theme name → file) and register its theme and layouts. */
function register(
	options: AstlideOptions,
	{ root, base }: { root: string; base: string },
	resolved: ResolvedPlugins,
	sources: [string, string][],
): Templates {
	const keepScripts = options.slideScripts === true;
	const templates: LoadedTemplate[] = [];
	for (const [theme, source] of sources) {
		let t: LoadedTemplate;
		try {
			t = loadTemplate(theme, source, root, base, keepScripts);
		} catch (e) {
			throw new Error(`[astlide] template "${theme}" (${source}): ${(e as Error).message}`);
		}
		templates.push(t);
		if (!resolved.themeNames.has(theme)) {
			resolved.themeNames.add(theme);
			resolved.themes.push({ name: theme, cssEntrypoint: t.cssPath });
		}
		for (const id of Object.keys(t.data.layouts)) resolved.layoutNames.add(id);
	}
	return {
		templates,
		reload: (t) => loadTemplate(t.theme, t.source, root, base, keepScripts),
	};
}
