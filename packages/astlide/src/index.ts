import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mdx from "@astrojs/mdx";
import type { AstroIntegration } from "astro";
import { astlideEditorPlugin, DEV_RELOAD_SCRIPT } from "./internal/editor-server";
import { astlideVirtualPlugin } from "./internal/virtual-plugins";
import { type AstlidePlugin, BUILT_IN_PLUGIN, resolvePlugins } from "./plugin";
import { astlideCodeHighlight } from "./utils/code-highlight";
import { astlideCommentNotesPlugin } from "./utils/comment-notes";
import { resolveFavicon } from "./utils/favicon";
import { astlideMermaid } from "./utils/mermaid";

// Re-export the typed deck/slide metadata API
export type { DeckContext } from "./context";
export { getClientDeckContext, getDeckContext } from "./context";
// Re-export the multi-format deck loader (MDX / Markdown / HTML)
export type { AstlideDeckLoaderOptions } from "./loader";
export { astlideDeckLoader } from "./loader";
// Re-export plugin API
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
	 *
	 * During `astro dev`, `worker-src 'self' blob:` is added (unless the policy sets
	 * `worker-src`) so Vite's client can reconnect after a server restart. Built
	 * output gets the policy as is.
	 */
	csp?: boolean | string;
	/**
	 * Allow search engines to index the deployed slide deck.
	 * When `false` (default), a `<meta name="robots" content="noindex, nofollow">` tag is injected.
	 * Set to `true` if you want the deck to be publicly discoverable.
	 */
	indexable?: boolean;
	/**
	 * Whether to inject Astlide's deck-index page at `/`.
	 *
	 * - unset (default): **auto** — inject only when you don't already have a
	 *   `src/pages/index.{astro,md,mdx,html}`, so a custom home page never collides
	 *   with the built-in index (a route collision is a hard error in future Astro).
	 * - `false`: never inject — you provide your own `/`.
	 * - `true`: always inject, even alongside your own index page.
	 */
	injectIndexRoute?: boolean;
	/**
	 * Astlide plugins. Each plugin can contribute themes, layout names, transition names,
	 * and Shiki languages/themes. Built-in themes/layouts/transitions are always registered.
	 */
	plugins?: AstlidePlugin[];
	/**
	 * Bottom navigation toolbar composition.
	 *
	 * Provide an ordered list of action IDs to render in the floating `.slide-nav`.
	 * Built-in actions:
	 *   `home` `prev` `counter` `next` `notes` `overview` `goto` `draw` `laser` `camera` `record` `presenter` `fullscreen` `print` `share`
	 *
	 * `goto` opens the go-to-slide dialog (also bound to `g`): jump by slide number
	 * or search slide titles.
	 *
	 * `draw` (`d`) toggles a pen over the slide (`c` clears the current slide's
	 * drawing) and `laser` (`l`) a laser pointer. Both are mirrored between the
	 * presenter and audience windows.
	 *
	 * `camera` (`v`) shows your webcam in a draggable bubble; `record` (`r`)
	 * records a screen / tab of your choice plus the microphone and downloads a
	 * `.webm` when stopped. Both need https or localhost.
	 *
	 * `home` links back to the deck index (`/`) and is always reachable — the
	 * toolbar reveals on hover, keyboard focus, and stays visible on touch devices.
	 *
	 * `download` (in-browser PDF export) is **experimental**: it depends on the
	 * pre-1.0 optional `@astlide/crispdf` and its output may change. Prefer the
	 * `astlide export` CLI for stable output.
	 *
	 * Default: `['prev', 'counter', 'next']` (original behavior).
	 */
	toolbar?: ToolbarItem[];
	/**
	 * Components rendered on **every** slide, after the slide content — for common
	 * chrome like a logo, footer, page number, or back-to-index link, without
	 * hand-placing it in each MDX/HTML file.
	 *
	 * Each string is a component module specifier (resolved as a Vite import).
	 * Components can read the current slide's metadata via `getDeckContext(Astro)`
	 * from `@astlide/core/context`. Equivalent to a plugin's `decorators`.
	 *
	 * @example
	 * ```ts
	 * astlide({ slideDecorators: ['./src/components/DeckFooter.astro'] })
	 * ```
	 */
	slideDecorators?: string[];
	/**
	 * Web font injection. Astlide injects a `<link>` to Google Fonts' Inter family
	 * by default so the built-in themes have a sane fallback. Override or disable:
	 *
	 * - `false`: do not inject any font stylesheet (use what your CSS specifies).
	 * - `string`: the `href` of a stylesheet — Astlide also preconnects the origin.
	 * - object: fine-grained control.
	 *
	 * @example
	 * ```ts
	 * astlide({ font: false })  // disable
	 * astlide({ font: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans&display=swap' })
	 * ```
	 */
	font?: FontOption;
	/**
	 * Favicon for deck pages and the deck index.
	 *
	 * - omitted: `favicon.svg`, `favicon.ico` or `favicon.png` from `public/`, if
	 *   present; otherwise an empty icon, so browsers don't request
	 *   `/favicon.ico` at the domain root (a 404 when deployed under a sub-path).
	 * - `string`: a root-relative path (Astro's `base` is added) or a URL.
	 * - `false`: no favicon link.
	 *
	 * @example
	 * ```ts
	 * astlide({ favicon: '/logo.png' })
	 * ```
	 */
	favicon?: string | false;
	/**
	 * Pen drawings (`d`).
	 *
	 * - `persist` (default `false`): keep drawings in the browser's
	 *   `localStorage`, so they survive reloads and come back the next time the
	 *   deck is opened in the same browser. Off by default so annotations from one
	 *   talk don't reappear in the next. `c` clears the current slide, `Shift+C`
	 *   the whole deck.
	 *
	 * @example
	 * ```ts
	 * astlide({ drawings: { persist: true } })
	 * ```
	 */
	drawings?: DrawingsOption;
}

/** Options for pen drawings. */
export interface DrawingsOption {
	/** Keep drawings in `localStorage` across reloads. Default: `false`. */
	persist?: boolean;
}

/** Web font injection options for the deck layout. */
export type FontOption =
	| false
	| string
	| {
			/** Stylesheet `href`. Required unless you only need preconnects. */
			href?: string;
			/** Origins to preconnect, in order. Defaults are inferred from `href` if omitted. */
			preconnect?: string[];
	  };

/** A toolbar item is either a built-in action ID or a separator. */
export type ToolbarItem =
	| "home"
	| "prev"
	| "next"
	| "counter"
	| "notes"
	| "overview"
	| "goto"
	| "draw"
	| "laser"
	| "camera"
	| "record"
	| "presenter"
	| "fullscreen"
	| "print"
	| "share"
	| "download"
	| "spacer";

/** Resolved font config that DeckLayout consumes — `null` means "inject nothing". */
interface ResolvedFont {
	href: string;
	preconnect: string[];
}

const DEFAULT_FONT: ResolvedFont = {
	href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
	preconnect: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
};

function resolveFontOption(font: FontOption | undefined): ResolvedFont | null {
	if (font === false) return null;
	if (font === undefined) return DEFAULT_FONT;
	if (typeof font === "string") {
		return { href: font, preconnect: inferPreconnects(font) };
	}
	const href = font.href ?? DEFAULT_FONT.href;
	return { href, preconnect: font.preconnect ?? inferPreconnects(href) };
}

function inferPreconnects(href: string): string[] {
	try {
		const { origin } = new URL(href);
		// Google Fonts also serves font files from fonts.gstatic.com — preconnect to both.
		if (origin === "https://fonts.googleapis.com") return [origin, "https://fonts.gstatic.com"];
		return [origin];
	} catch {
		return [];
	}
}

const CONTENT_CONFIG_EXAMPLE = `
import { defineCollection } from 'astro:content';
import { astlideDeckLoader, slideSchema } from '@astlide/core';

const decks = defineCollection({
  // Renders .mdx, .md, and .html slides from src/content/decks/<deck>/
  loader: astlideDeckLoader(),
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
	// Surface `slideDecorators` through the same resolution path as plugin decorators.
	const optionDecorators: AstlidePlugin[] = options.slideDecorators?.length
		? [
				{
					name: "astlide:options-decorators",
					decorators: options.slideDecorators.map((componentEntrypoint) => ({
						componentEntrypoint,
					})),
				},
			]
		: [];
	const allPlugins: AstlidePlugin[] = [
		BUILT_IN_PLUGIN,
		...(options.plugins ?? []),
		...optionDecorators,
	];
	const resolved = resolvePlugins(allPlugins);

	return {
		name: "astlide",
		hooks: {
			"astro:config:setup": ({
				command,
				config,
				injectRoute,
				injectScript,
				updateConfig,
				logger,
			}) => {
				// Auto-add MDX support if not already present
				const hasMdx = config.integrations.some((i) => i.name === "@astrojs/mdx");

				// Layout/decorator entrypoints may be given as project-relative paths
				// (e.g. "./src/components/Footer.astro"). Virtual modules can't resolve
				// those, so rewrite them to absolute paths against the project root.
				const resolveEntry = (spec: string) =>
					spec.startsWith(".") || spec.startsWith("/")
						? fileURLToPath(new URL(spec, config.root))
						: spec;
				for (const d of resolved.decorators) {
					d.componentEntrypoint = resolveEntry(d.componentEntrypoint);
				}
				for (const l of resolved.layouts) {
					if (l.componentEntrypoint) l.componentEntrypoint = resolveEntry(l.componentEntrypoint);
				}

				// Dev: pages that don't live-update reload on the editor's HMR events.
				if (command === "dev") injectScript("page", DEV_RELOAD_SCRIPT);

				// Optional `mermaid` (```mermaid diagrams): exposed via virtual:astlide/mermaid.
				const hasMermaid = isPackageInstalled("mermaid", fileURLToPath(config.root));

				const favicon = resolveFavicon(
					options.favicon,
					fileURLToPath(config.publicDir ?? new URL("public/", config.root)),
				);

				// Merge all config updates into a single call
				updateConfig({
					...(hasMdx ? {} : { integrations: [mdx()] }),
					markdown: {
						shikiConfig: {
							theme: options.shikiTheme ?? "github-dark",
							wrap: true,
							// `{2,4-6}` / `{2|3-5|all}` line highlighting on code fences, and
							// ```mermaid fences handed to the client-side diagram renderer.
							transformers: [astlideCodeHighlight(), astlideMermaid()],
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
						// `as never`: astlide and Astro can resolve different copies of vite's
						// types, so our `Plugin` isn't structurally identical to Astro's
						// `PluginOption`. The value is correct at runtime (build passes).
						plugins: [
							astlideVirtualPlugin(resolved, { hasMermaid }) as never,
							// Dev-only (apply: "serve"): read/write endpoint for the `e` slide editor.
							astlideEditorPlugin(fileURLToPath(config.root)) as never,
							// Speaker notes as a trailing `<!-- … -->`: MDX would reject the comment.
							astlideCommentNotesPlugin() as never,
						],
						// @astlide/crispdf declares `pdfjs-dist` as an optional peer for its
						// opt-in self-check feature. We never enable selfCheck from this
						// integration, so stub it out so Rollup doesn't fail when the peer
						// is absent.
						resolve: {
							alias: [
								{
									find: /^pdfjs-dist(?:\/.*)?$/,
									// Absolute path so Vite dedupes the module instead of warning
									// about an unresolved bare specifier.
									replacement: fileURLToPath(new URL("./internal/pdfjs-stub.ts", import.meta.url)),
								},
							],
						},
						// pdfjs-dist is excluded so neither the dev optimizer nor the prod
						// bundler tries to materialize the optional peer; the alias above
						// redirects any actual import to the no-op stub.
						optimizeDeps: {
							exclude: ["pdfjs-dist"],
							// Pre-bundle mermaid so the first diagram in dev doesn't trigger a
							// mid-session re-optimization (504 "Outdated Optimize Dep" + reload).
							...(hasMermaid ? { include: ["mermaid"] } : {}),
						},
						define: {
							// Expose options to injected pages via Vite define
							__ASTLIDE_CSP__: JSON.stringify(options.csp ?? true),
							__ASTLIDE_INDEXABLE__: JSON.stringify(options.indexable ?? false),
							__ASTLIDE_THEME_NAMES__: JSON.stringify([...resolved.themeNames]),
							__ASTLIDE_LAYOUT_NAMES__: JSON.stringify([...resolved.layoutNames]),
							__ASTLIDE_TRANSITION_NAMES__: JSON.stringify([...resolved.transitionNames]),
							__ASTLIDE_TOOLBAR__: JSON.stringify(options.toolbar ?? ["prev", "counter", "next"]),
							__ASTLIDE_FONT__: JSON.stringify(resolveFontOption(options.font)),
							__ASTLIDE_FAVICON__: JSON.stringify(favicon),
							// Page URLs end in "/" when that's how the site is served (see utils/base-path).
							__ASTLIDE_TRAILING_SLASH__: JSON.stringify(
								config.trailingSlash === "always" ||
									(config.trailingSlash !== "never" &&
										(config.build?.format ?? "directory") === "directory"),
							),
							__ASTLIDE_DRAWINGS_PERSIST__: JSON.stringify(options.drawings?.persist ?? false),
						},
					},
				});

				// Inject the page routes. `/[deck]/all` must come before `/[deck]/[...slide]`
				// so Astro's router matches it ahead of the generic slide pattern.
				injectRoute({
					pattern: "/[deck]/all",
					entrypoint: "@astlide/core/internal/pages/all.astro",
				});
				injectRoute({
					pattern: "/[deck]/[...slide]",
					entrypoint: "@astlide/core/internal/pages/slide.astro",
				});
				const srcDir = config.srcDir?.pathname ?? join(process.cwd(), "src");

				// Index route at `/`. Skipped when the user supplies their own
				// src/pages/index.* so the two don't collide (a route collision is a
				// hard error in future Astro). `injectIndexRoute` overrides detection:
				// `false` never injects, `true` always injects.
				const userIndexExists = ["astro", "md", "mdx", "html"].some((ext) =>
					existsSync(join(srcDir, "pages", `index.${ext}`)),
				);
				if (options.injectIndexRoute ?? !userIndexExists) {
					injectRoute({
						pattern: "/",
						entrypoint: "@astlide/core/internal/pages/index.astro",
					});
				} else if (options.injectIndexRoute === undefined) {
					logger.info(
						"Detected src/pages/index — skipping Astlide's deck index route at `/`. " +
							"Set injectIndexRoute: true to force it.",
					);
				}

				// Check for content collection config and warn if missing
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

/**
 * Whether `name` is installed for the project at `fromDir`, looking up the
 * `node_modules` chain the way Node resolution does. Used for optional
 * dependencies (e.g. `mermaid`) whose `exports` may not allow `require.resolve`.
 */
function isPackageInstalled(name: string, fromDir: string): boolean {
	let dir = fromDir;
	while (true) {
		if (existsSync(join(dir, "node_modules", name, "package.json"))) return true;
		const parent = dirname(dir);
		if (parent === dir) return false;
		dir = parent;
	}
}
