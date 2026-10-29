/**
 * Astlide for Nuxt: a folder of decks — the same `_config.json` and numbered
 * `.md` / `.mdx` / `.html` / `.pptx` slides as an Astlide site — as pages,
 * with the presenter window, overview, PDF and the rest of the deck runtime.
 *
 * ```ts
 * // nuxt.config.ts
 * export default defineNuxtConfig({
 *   modules: ["@astlide/nuxt"],
 *   astlide: { dir: "decks", basePath: "/decks" },
 * });
 * ```
 *
 * Pages: `<basePath>/` (the decks), `<basePath>/<deck>/<n>` (a slide) and
 * `<basePath>/<deck>/all` (the print view: PDF export, printing). The app
 * renders them with `<NuxtPage />`.
 *
 * Slides are read when the app is built (again on changes in development).
 * MDX slides are compiled with Astro's MDX engine into Vue components that
 * use `@astlide/vue`'s components: the same `.mdx` decks as an Astlide site,
 * rendered on the server and in the browser, with no MDX compiler at run time.
 *
 * @module
 */

import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { addVitePlugin, createResolver, defineNuxtModule, extendPages } from "@nuxt/kit";
import { astlideDecksPlugin } from "./vite";

export interface ModuleOptions {
	/** The folder holding the deck folders (default `decks`, from the project root). */
	dir: string;
	/** The URL path the deck pages are under, e.g. `/decks` (default: the root). */
	basePath: string;
	/** Toolbar buttons, in order (see Astlide's `toolbar` option). */
	toolbar?: string[];
	/** Shiki theme for code blocks (default `github-dark`). */
	shikiTheme?: string;
	/** Show slides marked `hidden` (default: only in development). */
	showHidden?: boolean;
	/**
	 * Render ```mermaid diagrams (needs the `mermaid` package). Default: when
	 * `mermaid` is installed. Without it, diagrams show as their source.
	 */
	mermaid?: boolean;
}

const STYLES = [
	"@astlide/core/styles/base.css",
	"@astlide/core/styles/deck.css",
	"@astlide/core/styles/slide.css",
	"@astlide/core/styles/components.css",
	"@astlide/core/styles/print.css",
	...["default", "dark", "minimal", "corporate", "gradient", "rose", "forest"].map(
		(theme) => `@astlide/core/styles/themes/${theme}.css`,
	),
	"katex/dist/katex.min.css",
];

const installed = (name: string, from: string) => {
	try {
		createRequire(join(from, "package.json")).resolve(name);
		return true;
	} catch {
		return false;
	}
};

export default defineNuxtModule<ModuleOptions>({
	meta: { name: "@astlide/nuxt", configKey: "astlide" },
	defaults: { dir: "decks", basePath: "" },
	setup(options, nuxt) {
		const { resolve: here } = createResolver(import.meta.url);
		// Without trailing slashes (a loop: a regex like /\/+$/ backtracks on long runs of them).
		let basePath = options.basePath;
		while (basePath.endsWith("/")) basePath = basePath.slice(0, -1);

		// Astlide's packages ship TypeScript.
		nuxt.options.build.transpile.push("@astlide/core", "@astlide/vue", "@astlide/nuxt");
		nuxt.options.css.push(...STYLES);

		addVitePlugin(
			astlideDecksPlugin({
				dir: resolve(nuxt.options.rootDir, options.dir),
				shikiTheme: options.shikiTheme,
				showHidden: options.showHidden ?? nuxt.options.dev,
				runtime: { basePath, toolbar: options.toolbar },
			}),
		);

		extendPages((pages) => {
			pages.push(
				{ name: "astlide-index", path: `${basePath}/`, file: here("./runtime/pages/index") },
				{
					name: "astlide-print",
					path: `${basePath}/:deck/all`,
					file: here("./runtime/pages/print"),
				},
				{
					name: "astlide-slide",
					path: `${basePath}/:deck/:slide(\\d+)`,
					file: here("./runtime/pages/slide"),
				},
			);
		});

		if (options.mermaid ?? installed("mermaid", nuxt.options.rootDir)) {
			nuxt.options.plugins.push({ src: here("./runtime/mermaid"), mode: "client" });
		}
	},
});
