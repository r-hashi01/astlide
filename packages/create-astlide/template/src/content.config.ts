import { defineCollection } from 'astro:content';
import { astlideDeckLoader, slideSchema } from '@astlide/core';

const decks = defineCollection({
  // .mdx, .md and .html slides (and .pptx files) under src/content/decks/<deck>/
  loader: astlideDeckLoader(),
  schema: slideSchema,
});

export const collections = { decks };
