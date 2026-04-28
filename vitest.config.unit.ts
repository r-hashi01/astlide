/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
	test: {
		name: "unit",
		include: ["packages/*/tests/**/*.test.ts"],
		exclude: ["**/astro-components.test.ts"],
		pool: "forks",
		hookTimeout: 30_000,
		testTimeout: 15_000,
		alias: {
			"astro/zod": "zod",
		},
	},
});
