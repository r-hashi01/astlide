import { defineCollection } from "astro:content";
import { slideSchema } from "@astlide/core/schema";
import { glob } from "astro/loaders";

const decks = defineCollection({
	loader: glob({ pattern: "**/*.mdx", base: "src/content/decks" }),
	schema: slideSchema,
});

export const collections = { decks };
