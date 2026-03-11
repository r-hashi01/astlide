import mdx from "@astrojs/mdx";
import type { AstroIntegration } from "astro";

export type { SlideData } from "./schema.js";
// Re-export public API
export { slideSchema } from "./schema.js";

export interface AstlideOptions {
	/** Shiki syntax highlighting theme. Default: 'github-dark' */
	shikiTheme?: string;
}

export default function astlide(options: AstlideOptions = {}): AstroIntegration {
	return {
		name: "astlide",
		hooks: {
			"astro:config:setup": ({ config, injectRoute, updateConfig }) => {
				// Auto-add MDX support if not already present
				const hasMdx = config.integrations.some((i) => i.name === "@astrojs/mdx");
				if (!hasMdx) {
					updateConfig({ integrations: [mdx()] });
				}

				// Inject the two page routes
				injectRoute({
					pattern: "/[deck]/[...slide]",
					entrypoint: "@astlide/core/internal/pages/slide.astro",
				});
				injectRoute({
					pattern: "/",
					entrypoint: "@astlide/core/internal/pages/index.astro",
				});

				// Configure Shiki for code highlighting
				updateConfig({
					markdown: {
						shikiConfig: {
							theme: options.shikiTheme ?? "github-dark",
							wrap: true,
						},
					},
				});
			},
		},
	};
}
