import { existsSync } from "node:fs";
import { join } from "node:path";
import mdx from "@astrojs/mdx";
import type { AstroIntegration } from "astro";
import { astlideVirtualPlugin } from "./internal/virtual-plugins";
import { type AstlidePlugin, BUILT_IN_PLUGIN, resolvePlugins } from "./plugin";

// Re-export plugin API
export type {
	AstlidePlugin,
	LayoutContribution,
	ResolvedPlugins,
	ShikiContribution,
	ThemeContribution,
	TransitionContribution,
} from "./plugin";
export { defineAstlidePlugin } from "./plugin";
// Re-export full public API from schema
export type { DeckConfig, SlideData, Theme } from "./schema";
export { deckConfigSchema, slideSchema, THEMES } from "./schema";

export interface AstlideOptions {
	/** Shiki syntax highlighting theme. Default: 'github-dark' */
	shikiTheme?: string;
	/**
	 * Content-Security-Policy configuration.
	 * - `true` (default): inject a sensible default CSP meta tag
	 * - `false`: disable CSP entirely
	 * - `string`: use a custom CSP policy string
	 */
	csp?: boolean | string;
	/**
	 * Allow search engines to index the deployed slide deck.
	 * When `false` (default), a `<meta name="robots" content="noindex, nofollow">` tag is injected.
	 * Set to `true` if you want the deck to be publicly discoverable.
	 */
	indexable?: boolean;
	/**
	 * Astlide plugins. Each plugin can contribute themes, layout names, transition names,
	 * and Shiki languages/themes. Built-in themes/layouts/transitions are always registered.
	 */
	plugins?: AstlidePlugin[];
}

const CONTENT_CONFIG_EXAMPLE = `
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { slideSchema } from '@astlide/core/schema';

const decks = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: 'src/content/decks' }),
  schema: slideSchema,
});

export const collections = { decks };
`.trim();

/**
 * Astro integration for the Astlide slide framework.
 *
 * Add to your `astro.config.mjs`:
 * ```ts
 * import { defineConfig } from 'astro/config';
 * import astlide from '@astlide/core';
 *
 * export default defineConfig({ integrations: [astlide()] });
 * ```
 *
 * @param options - Optional configuration for the integration.
 * @returns An Astro integration object that injects routes and configures MDX + Shiki.
 */
export default function astlide(options: AstlideOptions = {}): AstroIntegration {
	const allPlugins: AstlidePlugin[] = [BUILT_IN_PLUGIN, ...(options.plugins ?? [])];
	const resolved = resolvePlugins(allPlugins);

	return {
		name: "astlide",
		hooks: {
			"astro:config:setup": ({ config, injectRoute, updateConfig, logger }) => {
				// Auto-add MDX support if not already present
				const hasMdx = config.integrations.some((i) => i.name === "@astrojs/mdx");

				// Merge all config updates into a single call
				updateConfig({
					...(hasMdx ? {} : { integrations: [mdx()] }),
					markdown: {
						shikiConfig: {
							theme: options.shikiTheme ?? "github-dark",
							wrap: true,
							// biome-ignore lint/suspicious/noExplicitAny: Shiki types live behind dynamic loading
							langs: resolved.shiki.langs as any,
							themes: Object.fromEntries(
								resolved.shiki.themes
									.filter(
										(t): t is { name: string } =>
											typeof t === "object" && t !== null && "name" in t,
									)
									.map((t) => [t.name, t as never]),
							),
						},
					},
					vite: {
						plugins: [astlideVirtualPlugin(resolved)],
						define: {
							// Expose options to injected pages via Vite define
							__ASTLIDE_CSP__: JSON.stringify(options.csp ?? true),
							__ASTLIDE_INDEXABLE__: JSON.stringify(options.indexable ?? false),
							__ASTLIDE_THEME_NAMES__: JSON.stringify([...resolved.themeNames]),
							__ASTLIDE_LAYOUT_NAMES__: JSON.stringify([...resolved.layoutNames]),
							__ASTLIDE_TRANSITION_NAMES__: JSON.stringify([...resolved.transitionNames]),
						},
					},
				});

				// Inject the two page routes
				injectRoute({
					pattern: "/[deck]/[...slide]",
					entrypoint: "@astlide/core/internal/pages/slide.astro",
				});
				injectRoute({
					pattern: "/",
					entrypoint: "@astlide/core/internal/pages/index.astro",
				});

				// Check for content collection config and warn if missing
				const srcDir = config.srcDir?.pathname ?? join(process.cwd(), "src");
				const hasContentConfig = ["ts", "js", "mts", "mjs"].some((ext) =>
					existsSync(join(srcDir, `content.config.${ext}`)),
				);

				if (!hasContentConfig) {
					logger.warn(
						"No content collection config found. Create src/content.config.ts:\n\n" +
							CONTENT_CONFIG_EXAMPLE +
							"\n",
					);
				}

				// Check for decks directory
				const decksDir = join(srcDir, "content", "decks");
				if (!existsSync(decksDir)) {
					logger.warn(
						"No decks directory found at src/content/decks/. " +
							"Create a deck folder with MDX slides:\n" +
							"  src/content/decks/my-deck/01-intro.mdx\n",
					);
				}
			},
		},
	};
}
