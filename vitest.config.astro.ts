/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { getViteConfig } from "astro/config";
import { astlideVirtualPlugin } from "./packages/astlide/src/internal/virtual-plugins";
import {
	BUILT_IN_PLUGIN,
	defineAstlidePlugin,
	resolvePlugins,
} from "./packages/astlide/src/plugin";
import { astlideTemplatesPlugin } from "./packages/astlide/src/utils/pptx-templates";

// Slide.astro imports `virtual:astlide/layouts`; the integration emits that
// virtual module at build time, but in Container API tests the integration
// doesn't run. Register the same Vite plugin manually here, and include a
// test fixture so we can verify the dispatch path.
const fixturePath = fileURLToPath(
	new URL("./packages/astlide/tests/fixtures/FixtureLayout.astro", import.meta.url),
);
const resolved = resolvePlugins([
	BUILT_IN_PLUGIN,
	defineAstlidePlugin({
		name: "astlide-plugin-test-fixture",
		layouts: [{ name: "fixture-layout", componentEntrypoint: fixturePath }],
	}),
]);

// A PowerPoint template theme, as `virtual:astlide/templates` serves it.
const template = {
	theme: "fixture-template",
	source: "",
	cssPath: "",
	data: {
		layouts: {
			"title-slide": { art: '<i class="art">title art</i>', slideNumber: false },
			"title-and-content": { art: '<i class="art">content art</i>', slideNumber: true },
		},
		aliases: { cover: "title-slide", default: "title-and-content" },
		master: '<i class="art">master art</i>',
	},
};

export default getViteConfig({
	plugins: [astlideVirtualPlugin(resolved), astlideTemplatesPlugin([template], (t) => t)],
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
