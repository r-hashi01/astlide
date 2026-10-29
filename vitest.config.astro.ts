/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { getViteConfig } from "astro/config";
import {
	BUILT_IN_PLUGIN,
	defineAstlidePlugin,
	resolvePlugins,
} from "./packages/astlide/src/plugin";
import { astlideVirtualPlugin } from "./packages/astro/src/internal/virtual-plugins";

// Slide.astro imports `virtual:astlide/layouts`; the integration emits that
// virtual module at build time, but in Container API tests the integration
// doesn't run. Register the same Vite plugin manually here, and include a
// test fixture so we can verify the dispatch path.
const fixturePath = fileURLToPath(
	new URL("./packages/astro/tests/fixtures/FixtureLayout.astro", import.meta.url),
);
const resolved = resolvePlugins([
	BUILT_IN_PLUGIN,
	defineAstlidePlugin({
		name: "astlide-plugin-test-fixture",
		layouts: [{ name: "fixture-layout", componentEntrypoint: fixturePath }],
	}),
]);

// A PowerPoint template theme, served as `virtual:astlide/templates` serves the
// integration's (the real plugin, in internal/pptx-templates, imports
// @astlide/core, which this config file can't load: Node runs it as is).
const template = {
	theme: "fixture-template",
	data: {
		layouts: {
			"title-slide": { art: '<i class="art">title art</i>', slideNumber: false },
			"title-and-content": { art: '<i class="art">content art</i>', slideNumber: true },
		},
		aliases: { cover: "title-slide", default: "title-and-content" },
		master: '<i class="art">master art</i>',
	},
};

const templatesModule = {
	name: "astlide:templates-fixture",
	resolveId: (id: string) => (id === "virtual:astlide/templates" ? `\0${id}` : null),
	load: (id: string) =>
		id === "\0virtual:astlide/templates"
			? `export const templates = ${JSON.stringify({ [template.theme]: template.data })};\nexport const templateAssets = [];\n`
			: null,
};

export default getViteConfig({
	plugins: [astlideVirtualPlugin(resolved), templatesModule],
	// The integration sets this; without it notes are left out (fail closed).
	define: { __ASTLIDE_NOTES__: "true" },
	test: {
		name: "astro-components",
		include: ["**/astro-components.test.ts"],
		pool: "vmThreads",
		hookTimeout: 30_000,
		testTimeout: 15_000,
		alias: {
			"astro/zod": "zod",
		},
	},
});
