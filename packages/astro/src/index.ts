/**
 * The Astro integration of Astlide: decks in `src/content/decks/` as pages
 * of an Astro site, with the presenter window, PDF and PowerPoint export.
 * Also re-exports what an Astro project imports next to it (the deck loader,
 * the schemas, the plugin API and the deck metadata).
 *
 * @module @astlide/astro
 */

import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	astlideEditorPlugin,
	createEditorToken,
	createUnlockCodes,
	DEV_RELOAD_SCRIPT,
	EDITOR_UNLOCK_ENDPOINT,
	loadEditorSecret,
	UNLOCK_CODE_TTL_MS,
} from "@astlide/astro/internal/editor-server";
import { resolveFavicon } from "@astlide/astro/internal/favicon";
import { checkProject, warnDroppedPlugins } from "@astlide/astro/internal/setup/diagnostics";
import { resolveEntrypoints } from "@astlide/astro/internal/setup/entrypoints";
import { injectRoutes } from "@astlide/astro/internal/setup/routes";
import { loadTemplates } from "@astlide/astro/internal/setup/templates";
import { astlideConfig } from "@astlide/astro/internal/setup/vite";
import { type AstlidePlugin, BUILT_IN_PLUGIN, resolvePlugins } from "@astlide/core/plugin";
import type { TemplateStore } from "@astlide/core/templates";
import { EXPORT_BUILD_ENV, requestedExportBuild } from "@astlide/core/utils/export-build";
import { stripBuiltPages } from "@astlide/core/utils/slide-scripts";
import type { AstroIntegration } from "astro";
import { hashBuiltPages } from "./csp-hashes";

// Re-export the typed deck/slide metadata API
export type { DeckContext } from "@astlide/core/context";
export { getClientDeckContext, getDeckContext } from "@astlide/core/context";
// Re-export plugin API
export type {
	AstlidePlugin,
	DecoratorContribution,
	LayoutContribution,
	ResolvedPlugins,
	ShikiContribution,
	ThemeContribution,
	TransitionContribution,
} from "@astlide/core/plugin";
export { defineAstlidePlugin } from "@astlide/core/plugin";
// Re-export full public API from schema
export type { DeckConfig, SlideData, Theme } from "@astlide/core/schema";
export { deckConfigSchema, slideSchema, THEMES } from "@astlide/core/schema";
// Re-export the multi-format deck loader (MDX / Markdown / HTML)
export type { AstlideDeckLoaderOptions } from "./loader";
export { astlideDeckLoader } from "./loader";

export interface AstlideOptions {
	/** Shiki syntax highlighting theme. Default: 'github-dark' */
	shikiTheme?: string;
	/**
	 * Content-Security-Policy configuration.
	 * - `true` (default): inject a sensible default CSP meta tag
	 * - `false`: disable CSP entirely
	 * - `string`: use a custom CSP policy string
	 *
	 * In a build, the default policy allows inline scripts by hash, not
	 * `'unsafe-inline'`: after `astro build`, the inline `<script>`s Astlide and
	 * Astro put on each page, and those of MDX slides and their components
	 * (code), are hashed into its `script-src`. Inline scripts in Markdown, HTML
	 * and PowerPoint slides are not (see `slideScripts`), nor are inline
	 * event-handler attributes or `javascript:` URLs — those don't run. `style-src` keeps `'unsafe-inline'` for `style` attributes. A custom
	 * policy string is used as is.
	 *
	 * During `astro dev`, scripts stay on `'unsafe-inline'`, and
	 * `worker-src 'self' blob:` is added (unless the policy sets `worker-src`) so
	 * Vite's client can reconnect after a server restart.
	 */
	csp?: boolean | string;
	/**
	 * Let `<script>`s, inline event handlers (`onclick` …) and `javascript:`
	 * URLs in Markdown, HTML and PowerPoint slides run — in `astro dev` and in
	 * built pages, where their hashes join the default CSP. Default `false`:
	 * they are removed when the slide is rendered (and the CSP wouldn't allow
	 * them either), because slide content can come from others (an imported
	 * `.pptx`, an HTML slide someone sent), and in `astro dev` such a script
	 * would run next to the slide editor. MDX slides are code and always keep
	 * their scripts. Turn it on only for decks whose content you fully trust;
	 * for a script you want on your slides, prefer an MDX slide or a component.
	 */
	slideScripts?: boolean;
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
	 * Web font injection. Astlide injects a `<link>` to Google Fonts' Inter (text) and JetBrains Mono (code)
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
	 * PowerPoint templates as themes: theme name → a `.pptx` / `.potx` / `.thmx`
	 * file (project-relative; for Google Slides, File → Download → PowerPoint).
	 * Decks with `"theme": "<name>"` in `_config.json` get the template's
	 * colors, fonts and per-layout backgrounds and artwork, and their content
	 * goes where the template's placeholders are — the first heading into the
	 * title, the rest into the body.
	 *
	 * The built-in layouts map to the template's: `cover` → its title slide,
	 * `section` → section header, `default` → title and content, `two-column`
	 * → two content. Every template layout is also available by its name, as
	 * a slug (`slideLayout: comparison`, `slideLayout: title-only` …).
	 *
	 * Or a template store (see `@astlide/core/templates`): its location — a
	 * folder, `s3://`, `gs://` or `azure://<bucket>/<prefix>` — or the store
	 * itself. Every stored template is then a theme of its name, in its latest
	 * version, read when the server starts or the site builds. In dev, a
	 * folder store is watched and the server restarts when a template
	 * changes; for a bucket, restart the dev server.
	 *
	 * @example
	 * ```ts
	 * astlide({ templates: { brand: './templates/brand.pptx' } })
	 * astlide({ templates: 's3://acme-assets/astlide/templates' })
	 * ```
	 */
	templates?: Record<string, string> | string | TemplateStore;
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
	/**
	 * Where speaker notes are included.
	 * - `"dev"` (default): while running `astro dev`, and in the build
	 *   `astlide export` makes (so PowerPoint exports keep them). Pages you
	 *   build with `astro build` and deploy carry no notes; the presenter
	 *   window of a deployed deck says so.
	 * - `"public"`: in every page, built ones too — to present from the
	 *   deployed site with notes. Anyone with the deck's URL can then read
	 *   them (press `n`, open `?presenter`, view source).
	 *
	 * @example
	 * ```ts
	 * astlide({ notes: "public" })
	 * ```
	 */
	notes?: "public" | "dev";
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

/**
 * The Astlide Astro integration: slides that live in your Astro site.
 *
 * Add to your `astro.config.mjs`:
 * ```ts
 * import { defineConfig } from 'astro/config';
 * import astlide from '@astlide/astro';
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
	// Dev only: the project's editor secret, and the one-time codes for the link
	// printed once the server listens.
	let editorSecret: string | undefined;
	const unlockCodes = createUnlockCodes();
	let devProtocol = "http";
	// Marks where slide content starts and ends in a page, for the CSP pass
	// after the build: random per build, so content can't fake the end mark.
	const slideMark = randomBytes(16).toString("hex");

	return {
		name: "astlide",
		hooks: {
			"astro:config:setup": async ({
				command,
				config,
				injectRoute,
				injectScript,
				updateConfig,
				logger,
			}) => {
				// A file path (`URL.pathname` is percent-encoded, and wrong on Windows).
				const srcDir = fileURLToPath(config.srcDir ?? new URL("src/", config.root));
				const root = fileURLToPath(config.root);
				warnDroppedPlugins(resolved, logger);
				resolveEntrypoints(resolved, config.root);
				// Awaited only with a template store: without one, setup stays synchronous.
				const loading = loadTemplates(options, { root, base: config.base }, resolved);
				const templates = loading instanceof Promise ? await loading : loading;

				// Dev: pages that don't live-update reload on the editor's HMR events.
				// The editor endpoint only answers requests carrying this server's token,
				// which only the dev server's own pages on this machine can fetch.
				// Editing also needs a browser enabled through the link printed below,
				// whose secret only travels through the terminal.
				const editorToken = createEditorToken();
				if (command === "dev") {
					injectScript("page", DEV_RELOAD_SCRIPT);
					editorSecret = loadEditorSecret(root);
					if (config.vite?.server?.https) devProtocol = "https";
				}

				const favicon = resolveFavicon(
					options.favicon,
					fileURLToPath(config.publicDir ?? new URL("public/", config.root)),
				);

				// `astlide export` builds into (and previews from) its own folder — see utils/export-build.
				const { dir: exportBuild, ignored } = requestedExportBuild(root);
				if (ignored)
					logger.warn(
						`${EXPORT_BUILD_ENV}=${ignored} ignored: only astlide export sets it (to this project's export folder)`,
					);

				updateConfig(
					astlideConfig({
						options,
						resolved,
						command,
						config,
						templates,
						slideMark,
						editor: astlideEditorPlugin(
							root,
							editorToken,
							editorSecret ?? "",
							config.base,
							unlockCodes,
							join(srcDir, "content", "decks"),
						),
						exportBuild,
						favicon,
					}),
				);
				injectRoutes(
					{ injectRoute, logger },
					{ srcDir, injectIndexRoute: options.injectIndexRoute },
				);
				checkProject(srcDir, logger);
			},
			"astro:server:start": ({ address, logger }) => {
				if (!editorSecret) return;
				// A one-time code, not the secret: the link may end up in scrollback or history.
				const minutes = Math.round(UNLOCK_CODE_TTL_MS / 60_000);
				logger.info(
					`Slide editor: open ${devProtocol}://localhost:${address.port}${EDITOR_UNLOCK_ENDPOINT}?code=${unlockCodes.issue()} ` +
						`in your browser to enable editing (works once, for ${minutes} minutes)`,
				);
			},
			// Built pages: the default CSP's script-src gets the hashes of the inline
			// scripts Astlide and Astro put on pages, in place of 'unsafe-inline'
			// (slide scripts only with slideScripts; see utils/csp-hashes).
			"astro:build:done": async ({ dir, logger }) => {
				// Slide scripts leave the final pages too — also what Astro added after
				// the loader (see utils/slide-scripts) — before the CSP pass.
				if (!options.slideScripts) {
					const checked = await stripBuiltPages(fileURLToPath(dir), slideMark);
					if (checked) logger.info(`Slide content checked for scripts in ${checked} page(s)`);
				}
				const { pages, blocked } = await hashBuiltPages(fileURLToPath(dir), {
					mark: slideMark,
					slideScripts: options.slideScripts,
				});
				if (pages) logger.info(`CSP: inline scripts hashed in ${pages} page(s)`);
				if (blocked.length)
					logger.warn(
						`${blocked.length} page(s) have inline <script>s in slides, which won't run in the ` +
							"built site (CSP). Move them into a component, or set slideScripts: true if you " +
							`fully trust the decks' content. First: ${blocked[0]?.file}`,
					);
			},
		},
	};
}
