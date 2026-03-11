import { defineCollection } from "astro:content";
import { slideSchema } from "@astlide/core/schema";

const decks = defineCollection({
	type: "content",
	schema: slideSchema,
});

export const collections = { decks };
