/**
 * The Astro config the integration adds: MDX, Markdown's Shiki setup, and
 * the Vite plugins, aliases and defines the deck pages read.
 *
 * @module
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AstlideOptions } from "@astlide/astro";
import type { astlideEditorPlugin } from "@astlide/astro/internal/editor-server";
import { astlideTemplatesPlugin } from "@astlide/astro/internal/pptx-templates";
import { resolveFontOption } from "@astlide/astro/internal/setup/font";
import type { Templates } from "@astlide/astro/internal/setup/templates";
import { SLIDE_SCRIPTS_DEFINE } from "@astlide/astro/internal/slide-scripts-option";
import { astlideVirtualPlugin } from "@astlide/astro/internal/virtual-plugins";
import {
	astlideCommentNotesPlugin,
	astlideSlideScriptsPlugin,
} from "@astlide/astro/internal/vite-plugins";
import type { ResolvedPlugins } from "@astlide/core/plugin";
import { astlideCodeHighlight } from "@astlide/core/utils/code-highlight";
import { astlideMermaid } from "@astlide/core/utils/mermaid";
import { pptxAssetDir } from "@astlide/core/utils/pptx-assets";
import mdx from "@astrojs/mdx";
import type { AstroConfig } from "astro";

export interface AstlideConfigInput {
	options: AstlideOptions;
	resolved: ResolvedPlugins;
	command: "dev" | "build" | "preview" | "sync";
	config: AstroConfig;
	templates: Templates;
	/** Marks slide content in pages, for the script and CSP passes. */
	slideMark: string;
	/** The dev slide editor's Vite plugin. */
	editor: ReturnType<typeof astlideEditorPlugin>;
	/** `astlide export`'s build folder, when it is building. */
	exportBuild: string | undefined;
	/** The deck pages' favicon. */
	favicon: unknown;
}

/** What the integration passes to `updateConfig`, in one call. */
export function astlideConfig({
	options,
	resolved,
	command,
	config,
	templates,
	slideMark,
	editor,
	exportBuild,
	favicon,
}: AstlideConfigInput) {
	const root = config.root;
	// Auto-add MDX support if not already present
	const hasMdx = config.integrations.some((i) => i.name === "@astrojs/mdx");
	// Optional `mermaid` (```mermaid diagrams): exposed via virtual:astlide/mermaid.
	const hasMermaid = isPackageInstalled("mermaid", fileURLToPath(root));
	return {
		...(hasMdx ? {} : { integrations: [mdx()] }),
		...(exportBuild ? { outDir: pathToFileURL(`${exportBuild}/`) } : {}),
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
							(t): t is { name: string } => typeof t === "object" && t !== null && "name" in t,
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
				astlideTemplatesPlugin(
					templates.templates,
					templates.reload,
					command === "dev" ? templates.storeDir : undefined,
				) as never,
				// Dev only: slide scripts also leave the final HTML responses.
				...(options.slideScripts ? [] : [astlideSlideScriptsPlugin(slideMark) as never]),
				// Dev-only (apply: "serve"): read/write endpoint for the `e` slide editor.
				editor as never,
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
						replacement: createRequire(import.meta.url).resolve("@astlide/core/runtime/pdfjs-stub"),
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
				__ASTLIDE_SLIDE_MARK__: JSON.stringify(slideMark),
				// Read by the deck loader from its context's config.
				[SLIDE_SCRIPTS_DEFINE]: JSON.stringify(options.slideScripts === true),
				__ASTLIDE_INDEXABLE__: JSON.stringify(options.indexable ?? false),
				__ASTLIDE_THEME_NAMES__: JSON.stringify([...resolved.themeNames]),
				__ASTLIDE_LAYOUT_NAMES__: JSON.stringify([...resolved.layoutNames]),
				__ASTLIDE_TRANSITION_NAMES__: JSON.stringify([...resolved.transitionNames]),
				__ASTLIDE_TOOLBAR__: JSON.stringify(options.toolbar ?? ["prev", "counter", "next"]),
				__ASTLIDE_FONT__: JSON.stringify(resolveFontOption(options.font)),
				__ASTLIDE_PPTX_ASSETS__: JSON.stringify(pptxAssetDir(root)),
				__ASTLIDE_FAVICON__: JSON.stringify(favicon),
				// Page URLs end in "/" when that's how the site is served (see utils/base-path).
				__ASTLIDE_TRAILING_SLASH__: JSON.stringify(
					config.trailingSlash === "always" ||
						(config.trailingSlash !== "never" &&
							(config.build?.format ?? "directory") === "directory"),
				),
				__ASTLIDE_DRAWINGS_PERSIST__: JSON.stringify(options.drawings?.persist ?? false),
				__ASTLIDE_NOTES__: JSON.stringify(
					options.notes === "public" || command === "dev" || Boolean(exportBuild),
				),
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
