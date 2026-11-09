/**
 * The pages the integration adds: slides, the print view, `.pptx` assets,
 * and the deck index unless the project has its own.
 *
 * @module
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { PPTX_ASSET_ROUTE } from "@astlide/core/utils/pptx-assets";
import type { HookParameters } from "astro";

type Setup = HookParameters<"astro:config:setup">;

export function injectRoutes(
	{ injectRoute, logger }: Pick<Setup, "injectRoute" | "logger">,
	{ srcDir, injectIndexRoute }: { srcDir: string; injectIndexRoute: boolean | undefined },
): void {
	// Inject the page routes. `/[deck]/all` must come before `/[deck]/[...slide]`
	// so Astro's router matches it ahead of the generic slide pattern.
	// Pictures and fonts of .pptx slides (written by the deck loader).
	injectRoute({
		pattern: `${PPTX_ASSET_ROUTE}/[file]`,
		entrypoint: "@astlide/astro/internal/pages/pptx-asset.ts",
	});
	injectRoute({
		pattern: "/[deck]/all",
		entrypoint: "@astlide/astro/internal/pages/all.astro",
	});
	injectRoute({
		pattern: "/[deck]/[...slide]",
		entrypoint: "@astlide/astro/internal/pages/slide.astro",
	});

	// Index route at `/`. Skipped when the user supplies their own
	// src/pages/index.* so the two don't collide (a route collision is a
	// hard error in future Astro). `injectIndexRoute` overrides detection:
	// `false` never injects, `true` always injects.
	const userIndexExists = ["astro", "md", "mdx", "html"].some((ext) =>
		existsSync(join(srcDir, "pages", `index.${ext}`)),
	);
	if (injectIndexRoute ?? !userIndexExists) {
		injectRoute({
			pattern: "/",
			entrypoint: "@astlide/astro/internal/pages/index.astro",
		});
	} else if (injectIndexRoute === undefined) {
		logger.info(
			"Detected src/pages/index — skipping Astlide's deck index route at `/`. " +
				"Set injectIndexRoute: true to force it.",
		);
	}
}
