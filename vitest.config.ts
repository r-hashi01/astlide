/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: ["./vitest.config.unit.ts", "./vitest.config.astro.ts"],
	},
});
