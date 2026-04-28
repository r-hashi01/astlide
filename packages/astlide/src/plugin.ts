/**
 * Plugin API for Astlide.
 *
 * A plugin contributes themes, layout names, transition names, and Shiki languages/themes
 * to an Astlide deck. Plugins are registered via `astlide({ plugins: [...] })`.
 *
 * @example
 * ```ts
 * // my-plugin.ts
 * import { defineAstlidePlugin } from '@astlide/core/plugin';
 *
 * export default defineAstlidePlugin({
 *   name: 'astlide-plugin-midnight',
 *   themes: [{ name: 'midnight', cssEntrypoint: 'astlide-plugin-midnight/midnight.css' }],
 * });
 * ```
 */

/** A theme contribution: registers a theme name and the CSS entrypoint that supplies its `[data-theme="<name>"]` rules. */
export interface ThemeContribution {
	/** Theme identifier. Used as `[data-theme="<name>"]` selector and in `_config.json` `theme` field. */
	name: string;
	/** Module specifier resolved as a Vite import (e.g. `"astlide-plugin-midnight/midnight.css"`). */
	cssEntrypoint: string;
}

/** A layout contribution: registers a layout name. v1 only validates the name; component injection is deferred to v2. */
export interface LayoutContribution {
	/** Layout name used in slide frontmatter `slideLayout` field. */
	name: string;
	/**
	 * Optional component entrypoint (deferred to v2 — currently informational).
	 * In v1 the layout name is simply passed through as a CSS class on `.slide`.
	 */
	componentEntrypoint?: string;
}

/** A transition contribution: registers a transition name. The CSS class must be supplied by the plugin's theme/CSS. */
export interface TransitionContribution {
	/** Transition name used in slide frontmatter `transition` field. */
	name: string;
	/** Optional informational reference to the CSS class that styles the transition. */
	cssClass?: string;
}

/** Shiki contribution: extra languages or themes to register on the Astro markdown.shikiConfig. */
export interface ShikiContribution {
	langs?: unknown[];
	themes?: unknown[];
}

/** A plugin definition for Astlide. */
export interface AstlidePlugin {
	/** Unique plugin identifier — used for diagnostics and dedup. Convention: `astlide-plugin-*`. */
	name: string;
	themes?: ThemeContribution[];
	layouts?: LayoutContribution[];
	transitions?: TransitionContribution[];
	shiki?: ShikiContribution;
}

/** Helper that returns the plugin object as-is, providing type checking & autocomplete. */
export function defineAstlidePlugin(plugin: AstlidePlugin): AstlidePlugin {
	return plugin;
}

/** Aggregated, deduped contributions from all registered plugins. */
export interface ResolvedPlugins {
	themes: ThemeContribution[];
	layouts: LayoutContribution[];
	transitions: TransitionContribution[];
	shiki: { langs: unknown[]; themes: unknown[] };
	/** Set of all theme names (built-in + plugin) for runtime validation. */
	themeNames: Set<string>;
	/** Set of all layout names. */
	layoutNames: Set<string>;
	/** Set of all transition names. */
	transitionNames: Set<string>;
}

/**
 * Walk plugins, dedupe contributions by name, return aggregated state.
 *
 * Duplicates: first wins. Subsequent plugins re-using a name are silently dropped
 * to keep ordering predictable (built-in plugins are typically registered first).
 */
export function resolvePlugins(plugins: AstlidePlugin[]): ResolvedPlugins {
	const themes: ThemeContribution[] = [];
	const layouts: LayoutContribution[] = [];
	const transitions: TransitionContribution[] = [];
	const shikiLangs: unknown[] = [];
	const shikiThemes: unknown[] = [];
	const themeNames = new Set<string>();
	const layoutNames = new Set<string>();
	const transitionNames = new Set<string>();

	for (const plugin of plugins) {
		for (const theme of plugin.themes ?? []) {
			if (themeNames.has(theme.name)) continue;
			themeNames.add(theme.name);
			themes.push(theme);
		}
		for (const layout of plugin.layouts ?? []) {
			if (layoutNames.has(layout.name)) continue;
			layoutNames.add(layout.name);
			layouts.push(layout);
		}
		for (const transition of plugin.transitions ?? []) {
			if (transitionNames.has(transition.name)) continue;
			transitionNames.add(transition.name);
			transitions.push(transition);
		}
		if (plugin.shiki?.langs) shikiLangs.push(...plugin.shiki.langs);
		if (plugin.shiki?.themes) shikiThemes.push(...plugin.shiki.themes);
	}

	return {
		themes,
		layouts,
		transitions,
		shiki: { langs: shikiLangs, themes: shikiThemes },
		themeNames,
		layoutNames,
		transitionNames,
	};
}

/** Built-in theme contributions — registered as a synthetic plugin so the resolution path is unified. */
export const BUILT_IN_THEMES: ThemeContribution[] = [
	{ name: "default", cssEntrypoint: "@astlide/core/styles/themes/default.css" },
	{ name: "dark", cssEntrypoint: "@astlide/core/styles/themes/dark.css" },
	{ name: "minimal", cssEntrypoint: "@astlide/core/styles/themes/minimal.css" },
	{ name: "corporate", cssEntrypoint: "@astlide/core/styles/themes/corporate.css" },
	{ name: "gradient", cssEntrypoint: "@astlide/core/styles/themes/gradient.css" },
	{ name: "rose", cssEntrypoint: "@astlide/core/styles/themes/rose.css" },
	{ name: "forest", cssEntrypoint: "@astlide/core/styles/themes/forest.css" },
];

/** Built-in layout names — for runtime warning on unknown layouts. */
export const BUILT_IN_LAYOUTS: LayoutContribution[] = [
	{ name: "default" },
	{ name: "cover" },
	{ name: "section" },
	{ name: "two-column" },
	{ name: "image-full" },
	{ name: "image-left" },
	{ name: "image-right" },
	{ name: "code" },
	{ name: "quote" },
	{ name: "statement" },
];

/** Built-in transition names. */
export const BUILT_IN_TRANSITIONS: TransitionContribution[] = [
	{ name: "none" },
	{ name: "fade" },
	{ name: "slide-left" },
	{ name: "slide-right" },
	{ name: "slide-up" },
	{ name: "zoom" },
];

/** Synthetic plugin that exposes Astlide's built-in themes/layouts/transitions through the same API. */
export const BUILT_IN_PLUGIN: AstlidePlugin = {
	name: "@astlide/core/built-in",
	themes: BUILT_IN_THEMES,
	layouts: BUILT_IN_LAYOUTS,
	transitions: BUILT_IN_TRANSITIONS,
};
