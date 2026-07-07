/**
 * Plugin API for Astlide.
 *
 * A plugin contributes themes, layout names, transition names, and Shiki languages/themes
 * to an Astlide deck. Plugins are registered via `astlide({ plugins: [...] })`.
 *
 * ## Minimal plugin
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
 *
 * ## Full custom-theme plugin
 *
 * A theme plugin is just an npm package (or a local module) that contributes:
 *   1. A `themes[].cssEntrypoint` that defines CSS variables under `[data-theme="<name>"]`.
 *   2. Optionally additional layouts, transitions, Shiki langs/themes.
 *
 * Directory layout:
 * ```
 * astlide-plugin-acme/
 *   package.json       # "exports": { "./acme.css": "./acme.css", ".": "./index.ts" }
 *   index.ts
 *   acme.css
 * ```
 *
 * `index.ts`:
 * ```ts
 * import { defineAstlidePlugin } from '@astlide/core/plugin';
 *
 * export default defineAstlidePlugin({
 *   name: 'astlide-plugin-acme',
 *   themes: [{ name: 'acme', cssEntrypoint: 'astlide-plugin-acme/acme.css' }],
 *   transitions: [{ name: 'acme-warp' }],
 * });
 * ```
 *
 * `acme.css`:
 * ```css
 * [data-theme="acme"] {
 *   --color-bg: #0b132b;
 *   --color-fg: #fefefe;
 *   --color-primary: #5bc0eb;
 *   --font-heading: "JetBrains Mono", monospace;
 *   --font-body: "Inter", system-ui, sans-serif;
 * }
 *
 * [data-theme="acme"] .slide[data-transition="acme-warp"] {
 *   animation: acme-warp 320ms cubic-bezier(.2, .9, .3, 1);
 * }
 *
 * @keyframes acme-warp {
 *   from { transform: scale(1.04) skewX(-2deg); opacity: 0; }
 *   to   { transform: none; opacity: 1; }
 * }
 * ```
 *
 * Consume from `astro.config.mjs`:
 * ```ts
 * import astlide from '@astlide/core';
 * import acme from 'astlide-plugin-acme';
 *
 * export default defineConfig({
 *   integrations: [astlide({ plugins: [acme] })],
 * });
 * ```
 *
 * Then use `theme: "acme"` in `_config.json` and `transition: "acme-warp"` per slide.
 */

/** A theme contribution: registers a theme name and the CSS entrypoint that supplies its `[data-theme="<name>"]` rules. */
export interface ThemeContribution {
	/** Theme identifier. Used as `[data-theme="<name>"]` selector and in `_config.json` `theme` field. */
	name: string;
	/** Module specifier resolved as a Vite import (e.g. `"astlide-plugin-midnight/midnight.css"`). */
	cssEntrypoint: string;
}

/** A layout contribution: registers a layout name and (optionally) an Astro component that owns the slide markup. */
export interface LayoutContribution {
	/** Layout name used in slide frontmatter `slideLayout` field. */
	name: string;
	/**
	 * Module specifier of an Astro component to render this layout, resolved as a Vite import
	 * (e.g. `"astlide-plugin-acme/QuoteLayout.astro"`). When provided, the component
	 * replaces the default `<section class="slide">` shell — it receives all `Slide`
	 * props (`layout`, `transition`, `background`, `class`, `slideNumber`, `totalSlides`)
	 * and the MDX body as the default slot.
	 *
	 * When omitted, the layout name only contributes a `.slide-<name>` CSS class that
	 * theme CSS can target — useful for purely visual variants.
	 *
	 * @example
	 * ```ts
	 * defineAstlidePlugin({
	 *   name: 'astlide-plugin-acme',
	 *   layouts: [
	 *     { name: 'acme-quote', componentEntrypoint: 'astlide-plugin-acme/QuoteLayout.astro' },
	 *   ],
	 * });
	 * ```
	 *
	 * The component (`QuoteLayout.astro`):
	 * ```astro
	 * ---
	 * interface Props { layout?: string; background?: string; slideNumber?: number; totalSlides?: number; transition?: string; class?: string; }
	 * const { transition, class: className, slideNumber, totalSlides } = Astro.props;
	 * ---
	 * <section class:list={['slide', 'slide-acme-quote', className]} data-transition={transition}
	 *          role="region" aria-roledescription="slide"
	 *          aria-label={slideNumber && totalSlides ? `Slide ${slideNumber} of ${totalSlides}` : undefined}>
	 *   <blockquote class="slide-content"><slot /></blockquote>
	 * </section>
	 * ```
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

/**
 * A slide decorator: a component rendered on **every** slide, after the slide
 * content. Use it to apply common chrome — logo, footer, page number, a
 * back-to-index link — without hand-placing it in each MDX/HTML file.
 *
 * The component receives the slide props (`slideNumber`, `totalSlides`,
 * `layout`, `transition`) and can read the full typed metadata via
 * `getDeckContext(Astro)` from `@astlide/core/context`. Position it with CSS
 * (`.slide` is `position: relative`).
 *
 * @example
 * ```ts
 * defineAstlidePlugin({
 *   name: 'astlide-plugin-acme',
 *   decorators: [{ componentEntrypoint: 'astlide-plugin-acme/Footer.astro' }],
 * });
 * ```
 */
export interface DecoratorContribution {
	/** Module specifier of an `.astro` component resolved as a Vite import. */
	componentEntrypoint: string;
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
	/** Components rendered on every slide (logo / footer / page number / home link). */
	decorators?: DecoratorContribution[];
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
	/** Every-slide decorator components, in registration order. */
	decorators: DecoratorContribution[];
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
	const decorators: DecoratorContribution[] = [];
	const decoratorEntrypoints = new Set<string>();
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
		for (const decorator of plugin.decorators ?? []) {
			if (decoratorEntrypoints.has(decorator.componentEntrypoint)) continue;
			decoratorEntrypoints.add(decorator.componentEntrypoint);
			decorators.push(decorator);
		}
		if (plugin.shiki?.langs) shikiLangs.push(...plugin.shiki.langs);
		if (plugin.shiki?.themes) shikiThemes.push(...plugin.shiki.themes);
	}

	return {
		themes,
		layouts,
		transitions,
		decorators,
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
