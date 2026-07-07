import { describe, expect, it } from "vitest";
import { astlideVirtualPlugin } from "../src/internal/virtual-plugins";
import {
	BUILT_IN_LAYOUTS,
	BUILT_IN_PLUGIN,
	BUILT_IN_THEMES,
	BUILT_IN_TRANSITIONS,
	defineAstlidePlugin,
	resolvePlugins,
} from "../src/plugin";

describe("defineAstlidePlugin", () => {
	it("returns the plugin object as-is for type inference", () => {
		const plugin = defineAstlidePlugin({
			name: "astlide-plugin-example",
			themes: [{ name: "neon", cssEntrypoint: "astlide-plugin-example/neon.css" }],
		});
		expect(plugin.name).toBe("astlide-plugin-example");
		expect(plugin.themes?.[0].name).toBe("neon");
	});
});

describe("BUILT_IN_PLUGIN", () => {
	it("registers all 7 built-in themes", () => {
		expect(BUILT_IN_THEMES.map((t) => t.name)).toEqual([
			"default",
			"dark",
			"minimal",
			"corporate",
			"gradient",
			"rose",
			"forest",
		]);
		expect(BUILT_IN_PLUGIN.themes).toEqual(BUILT_IN_THEMES);
	});

	it("registers 10 built-in layouts", () => {
		expect(BUILT_IN_LAYOUTS.map((l) => l.name)).toEqual([
			"default",
			"cover",
			"section",
			"two-column",
			"image-full",
			"image-left",
			"image-right",
			"code",
			"quote",
			"statement",
		]);
	});

	it("registers 6 built-in transitions", () => {
		expect(BUILT_IN_TRANSITIONS.map((t) => t.name)).toEqual([
			"none",
			"fade",
			"slide-left",
			"slide-right",
			"slide-up",
			"zoom",
		]);
	});
});

describe("resolvePlugins", () => {
	it("aggregates contributions from multiple plugins", () => {
		const resolved = resolvePlugins([
			BUILT_IN_PLUGIN,
			defineAstlidePlugin({
				name: "astlide-plugin-midnight",
				themes: [{ name: "midnight", cssEntrypoint: "midnight/style.css" }],
				layouts: [{ name: "split-quote" }],
				transitions: [{ name: "iris" }],
			}),
		]);
		expect(resolved.themes.length).toBe(8);
		expect(resolved.themeNames.has("midnight")).toBe(true);
		expect(resolved.themeNames.has("default")).toBe(true);
		expect(resolved.layoutNames.has("split-quote")).toBe(true);
		expect(resolved.transitionNames.has("iris")).toBe(true);
	});

	it("dedupes by name — first registration wins", () => {
		const resolved = resolvePlugins([
			BUILT_IN_PLUGIN,
			defineAstlidePlugin({
				name: "astlide-plugin-override",
				// "default" is already registered by BUILT_IN_PLUGIN — this entry is dropped.
				themes: [{ name: "default", cssEntrypoint: "evil/default.css" }],
			}),
		]);
		const defaultTheme = resolved.themes.find((t) => t.name === "default");
		expect(defaultTheme?.cssEntrypoint).toBe("@astlide/core/styles/themes/default.css");
		// Built-in count should be preserved.
		expect(resolved.themes.filter((t) => t.name === "default").length).toBe(1);
	});

	it("aggregates Shiki langs and themes", () => {
		const resolved = resolvePlugins([
			defineAstlidePlugin({
				name: "astlide-plugin-extra-langs",
				shiki: { langs: ["solidity"], themes: [{ name: "neon-night" }] },
			}),
			defineAstlidePlugin({
				name: "astlide-plugin-more-langs",
				shiki: { langs: ["zig"] },
			}),
		]);
		expect(resolved.shiki.langs).toEqual(["solidity", "zig"]);
		expect(resolved.shiki.themes).toEqual([{ name: "neon-night" }]);
	});

	it("returns empty containers when no plugins are registered", () => {
		const resolved = resolvePlugins([]);
		expect(resolved.themes).toEqual([]);
		expect(resolved.layouts).toEqual([]);
		expect(resolved.transitions).toEqual([]);
		expect(resolved.decorators).toEqual([]);
		expect(resolved.shiki.langs).toEqual([]);
		expect(resolved.shiki.themes).toEqual([]);
	});

	it("aggregates and dedupes slide decorators by entrypoint", () => {
		const resolved = resolvePlugins([
			defineAstlidePlugin({
				name: "astlide-plugin-a",
				decorators: [{ componentEntrypoint: "a/Footer.astro" }],
			}),
			defineAstlidePlugin({
				name: "astlide-plugin-b",
				decorators: [
					{ componentEntrypoint: "b/Logo.astro" },
					// Duplicate entrypoint — dropped.
					{ componentEntrypoint: "a/Footer.astro" },
				],
			}),
		]);
		expect(resolved.decorators.map((d) => d.componentEntrypoint)).toEqual([
			"a/Footer.astro",
			"b/Logo.astro",
		]);
	});

	it("handles plugins without optional fields", () => {
		const resolved = resolvePlugins([defineAstlidePlugin({ name: "barebones" })]);
		expect(resolved.themes).toEqual([]);
		expect(resolved.layouts).toEqual([]);
		expect(resolved.transitions).toEqual([]);
	});
});

describe("astlideVirtualPlugin", () => {
	function load(plugin: ReturnType<typeof astlideVirtualPlugin>, id: string): string | null {
		const resolveIdFn =
			typeof plugin.resolveId === "function" ? plugin.resolveId : plugin.resolveId?.handler;
		const loadFn = typeof plugin.load === "function" ? plugin.load : plugin.load?.handler;
		if (!resolveIdFn || !loadFn) throw new Error("plugin hooks missing");
		const resolved = (resolveIdFn as (id: string) => string | null).call(null, id);
		if (!resolved) return null;
		return (loadFn as (id: string) => string | null).call(null, resolved);
	}

	it("emits an empty layouts map when no plugin contributes a component", () => {
		const resolved = resolvePlugins([BUILT_IN_PLUGIN]);
		const code = load(astlideVirtualPlugin(resolved), "virtual:astlide/layouts");
		expect(code).toBeTruthy();
		// Built-in layouts have no componentEntrypoint, so the map must be empty.
		expect(code).toContain("export const layouts = {  };");
		expect(code).not.toContain("import __astlideLayout");
	});

	it("emits static imports + a map for plugin-contributed layout components", () => {
		const resolved = resolvePlugins([
			BUILT_IN_PLUGIN,
			defineAstlidePlugin({
				name: "astlide-plugin-acme",
				layouts: [
					{ name: "acme-quote", componentEntrypoint: "astlide-plugin-acme/Quote.astro" },
					{ name: "acme-cover", componentEntrypoint: "astlide-plugin-acme/Cover.astro" },
					{ name: "acme-bare" }, // No component — CSS-only, must be omitted from the map.
				],
			}),
		]);
		const code = load(astlideVirtualPlugin(resolved), "virtual:astlide/layouts");
		expect(code).toBeTruthy();
		expect(code).toContain('import __astlideLayout0 from "astlide-plugin-acme/Quote.astro";');
		expect(code).toContain('import __astlideLayout1 from "astlide-plugin-acme/Cover.astro";');
		expect(code).toContain('"acme-quote": __astlideLayout0');
		expect(code).toContain('"acme-cover": __astlideLayout1');
		expect(code).not.toContain("acme-bare");
	});

	it("emits an empty decorators array when none are contributed", () => {
		const resolved = resolvePlugins([BUILT_IN_PLUGIN]);
		const code = load(astlideVirtualPlugin(resolved), "virtual:astlide/decorators");
		expect(code).toContain("export const decorators = [];");
	});

	it("emits static imports + an ordered array for contributed decorators", () => {
		const resolved = resolvePlugins([
			defineAstlidePlugin({
				name: "astlide-plugin-acme",
				decorators: [
					{ componentEntrypoint: "astlide-plugin-acme/Footer.astro" },
					{ componentEntrypoint: "astlide-plugin-acme/Logo.astro" },
				],
			}),
		]);
		const code = load(astlideVirtualPlugin(resolved), "virtual:astlide/decorators");
		expect(code).toContain('import __astlideDecorator0 from "astlide-plugin-acme/Footer.astro";');
		expect(code).toContain('import __astlideDecorator1 from "astlide-plugin-acme/Logo.astro";');
		expect(code).toContain("export const decorators = [__astlideDecorator0, __astlideDecorator1];");
	});

	it("returns null for non-virtual module ids", () => {
		const plugin = astlideVirtualPlugin(resolvePlugins([BUILT_IN_PLUGIN]));
		const resolveIdFn =
			typeof plugin.resolveId === "function" ? plugin.resolveId : plugin.resolveId?.handler;
		expect(
			(resolveIdFn as (id: string) => string | null).call(null, "./some-local-file"),
		).toBeNull();
	});
});
