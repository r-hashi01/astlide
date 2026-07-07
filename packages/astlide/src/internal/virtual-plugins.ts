import type { Plugin } from "vite";
import type { ResolvedPlugins } from "../plugin";

/**
 * Vite plugin that exposes Astlide plugin contributions as virtual modules.
 *
 * Modules:
 *   - `virtual:astlide/themes`     — side-effect CSS imports, one per theme.
 *   - `virtual:astlide/layouts`    — `{ layouts: Record<string, AstroComponent> }`
 *     populated by static imports of each plugin-contributed layout component.
 *   - `virtual:astlide/decorators` — `{ decorators: AstroComponent[] }`, the
 *     components rendered on every slide (logo / footer / home link).
 *
 * The static-import shape matters: Astro components can only be dispatched
 * dynamically (`<LayoutComponent />`) when they are already in the module graph,
 * so we resolve every `componentEntrypoint` at build time rather than via
 * runtime `import()`.
 */
export function astlideVirtualPlugin(resolved: ResolvedPlugins): Plugin {
	const VIRTUAL_THEMES_ID = "virtual:astlide/themes";
	const RESOLVED_THEMES_ID = "\0virtual:astlide/themes";
	const VIRTUAL_LAYOUTS_ID = "virtual:astlide/layouts";
	const RESOLVED_LAYOUTS_ID = "\0virtual:astlide/layouts";
	const VIRTUAL_DECORATORS_ID = "virtual:astlide/decorators";
	const RESOLVED_DECORATORS_ID = "\0virtual:astlide/decorators";

	return {
		name: "astlide:virtual",
		resolveId(id) {
			if (id === VIRTUAL_THEMES_ID) return RESOLVED_THEMES_ID;
			if (id === VIRTUAL_LAYOUTS_ID) return RESOLVED_LAYOUTS_ID;
			if (id === VIRTUAL_DECORATORS_ID) return RESOLVED_DECORATORS_ID;
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
			if (id === RESOLVED_LAYOUTS_ID) {
				const contributed = resolved.layouts.filter((l) => l.componentEntrypoint);
				const imports = contributed.map(
					(l, i) =>
						`import __astlideLayout${i} from ${JSON.stringify(l.componentEntrypoint as string)};`,
				);
				const entries = contributed.map((l, i) => `${JSON.stringify(l.name)}: __astlideLayout${i}`);
				return `${imports.join("\n")}\nexport const layouts = { ${entries.join(", ")} };\n`;
			}
			if (id === RESOLVED_DECORATORS_ID) {
				const imports = resolved.decorators.map(
					(d, i) => `import __astlideDecorator${i} from ${JSON.stringify(d.componentEntrypoint)};`,
				);
				const list = resolved.decorators.map((_d, i) => `__astlideDecorator${i}`);
				return `${imports.join("\n")}\nexport const decorators = [${list.join(", ")}];\n`;
			}
			return null;
		},
	};
}
