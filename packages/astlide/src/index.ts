/**
 * Astlide's framework-agnostic core: the frontmatter and `_config.json`
 * schemas, the plugin API and the typed deck metadata. The framework packages
 * build on it — `@astlide/astro` (the Astro integration), `@astlide/react`,
 * `@astlide/next`, `@astlide/vue` and `@astlide/nuxt` — and so do its other
 * entry points: `@astlide/core/deck` (read decks), `@astlide/core/render`
 * (render and export them without a site), `@astlide/core/runtime` (the deck
 * runtime), `@astlide/core/pptx`, `@astlide/core/templates`, `@astlide/core/mcp`
 * and the `astlide` CLI.
 *
 * @module @astlide/core
 */

export type { DeckContext } from "./context";
export { getClientDeckContext, getDeckContext } from "./context";
export type {
	AstlidePlugin,
	DecoratorContribution,
	LayoutContribution,
	ResolvedPlugins,
	ShikiContribution,
	ThemeContribution,
	TransitionContribution,
} from "./plugin";
export { defineAstlidePlugin } from "./plugin";
export type { DeckConfig, SlideData, Theme } from "./schema";
export { deckConfigSchema, slideSchema, THEMES } from "./schema";
