/**
 * What the integration warns about at setup: plugins registering a name
 * twice, and a project without a content config or decks folder.
 *
 * @module
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { decksDirIn } from "@astlide/core/deck/files";
import type { ResolvedPlugins } from "@astlide/core/plugin";
import type { AstroIntegrationLogger } from "astro";

const CONTENT_CONFIG_EXAMPLE = `
import { defineCollection } from 'astro:content';
import { astlideDeckLoader, slideSchema } from '@astlide/astro';

const decks = defineCollection({
  // Renders .mdx, .md, and .html slides from src/content/decks/<deck>/
  loader: astlideDeckLoader(),
  schema: slideSchema,
});

export const collections = { decks };
`.trim();

/** Contributions a later plugin registered again, and so were ignored. */
export function warnDroppedPlugins(
	resolved: ResolvedPlugins,
	logger: AstroIntegrationLogger,
): void {
	for (const { kind, name, plugin } of resolved.dropped) {
		logger.warn(
			`Plugin "${plugin}" registers the ${kind} "${name}", which is already registered; it is ignored.`,
		);
	}
}

/** A missing content collection config or decks folder. */
export function checkProject(srcDir: string, logger: AstroIntegrationLogger): void {
	// Check for content collection config and warn if missing
	const hasContentConfig = ["ts", "js", "mts", "mjs"].some((ext) =>
		existsSync(join(srcDir, `content.config.${ext}`)),
	);

	if (!hasContentConfig) {
		logger.warn(
			"No content collection config found. Create src/content.config.ts:\n\n" +
				CONTENT_CONFIG_EXAMPLE +
				"\n",
		);
	}

	// Check for decks directory
	const decksDir = decksDirIn(srcDir);
	if (!existsSync(decksDir)) {
		logger.warn(
			"No decks directory found at src/content/decks/. " +
				"Create a deck folder with MDX slides:\n" +
				"  src/content/decks/my-deck/01-intro.mdx\n",
		);
	}
}
