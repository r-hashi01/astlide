import { defineCollection } from "astro:content";
import { astlideDeckLoader, slideSchema } from "@astlide/core";

const decks = defineCollection({
	// Renders .mdx, .md, and .html slides from src/content/decks/<deck>/
	loader: astlideDeckLoader(),
	schema: slideSchema,
});

export const collections = { decks };
