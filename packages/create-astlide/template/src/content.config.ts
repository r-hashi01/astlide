import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { slideSchema } from '@astlide/core/schema';

const decks = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: 'src/content/decks' }),
  schema: slideSchema,
});

export const collections = { decks };
