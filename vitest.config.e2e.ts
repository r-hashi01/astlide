import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "e2e",
					include: ["e2e/**/*.test.ts"],
					globalSetup: ["e2e/helpers/setup.ts"],
					testTimeout: 30_000,
					hookTimeout: 15_000,
					sequence: { concurrent: false },
					fileParallelism: false,
				},
			},
		],
	},
});
