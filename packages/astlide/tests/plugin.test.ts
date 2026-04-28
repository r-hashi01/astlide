import { describe, expect, it } from "vitest";
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
		expect(resolved.shiki.langs).toEqual([]);
		expect(resolved.shiki.themes).toEqual([]);
	});

	it("handles plugins without optional fields", () => {
		const resolved = resolvePlugins([defineAstlidePlugin({ name: "barebones" })]);
		expect(resolved.themes).toEqual([]);
		expect(resolved.layouts).toEqual([]);
		expect(resolved.transitions).toEqual([]);
	});
});
