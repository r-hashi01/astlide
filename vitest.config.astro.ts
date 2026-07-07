/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { getViteConfig } from "astro/config";
import { astlideVirtualPlugin } from "./packages/astlide/src/internal/virtual-plugins";
import {
	BUILT_IN_PLUGIN,
	defineAstlidePlugin,
	resolvePlugins,
} from "./packages/astlide/src/plugin";

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

export default getViteConfig({
	plugins: [astlideVirtualPlugin(resolved)],
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
