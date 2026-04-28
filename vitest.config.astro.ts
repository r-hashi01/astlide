/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
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
