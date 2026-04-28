import type { Plugin } from "vite";
import type { ResolvedPlugins } from "../plugin";

/**
 * Vite plugin that exposes Astlide plugin contributions as virtual modules.
 *
 * Modules:
 *   - `virtual:astlide/themes` — emits `import "<cssEntrypoint>";` for every theme.
 *
 * The DeckLayout imports `virtual:astlide/themes` exactly once; the side-effect imports
 * pull every theme's CSS into the bundle so `[data-theme="<name>"]` selectors are scoped
 * by CSS variables.
 */
export function astlideVirtualPlugin(resolved: ResolvedPlugins): Plugin {
	const VIRTUAL_THEMES_ID = "virtual:astlide/themes";
	const RESOLVED_THEMES_ID = "\0virtual:astlide/themes";

	return {
		name: "astlide:virtual",
		resolveId(id) {
			if (id === VIRTUAL_THEMES_ID) return RESOLVED_THEMES_ID;
			return null;
		},
		load(id) {
			if (id === RESOLVED_THEMES_ID) {
				// Emit one side-effect import per theme. Order matters: built-in first, then plugin themes.
				const lines = resolved.themes.map(
					(theme) => `import ${JSON.stringify(theme.cssEntrypoint)};`,
				);
				return `${lines.join("\n")}\n`;
			}
			return null;
		},
	};
}
