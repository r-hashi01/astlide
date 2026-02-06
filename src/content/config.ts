import { defineCollection, z } from 'astro:content';

const slideSchema = z.object({
  layout: z.enum([
    'default',
    'cover',
    'section',
    'two-column',
    'image-full',
    'code',
    'quote',
  ]).default('default'),
  transition: z.enum([
    'none',
    'fade',
    'slide-left',
    'slide-right',
    'slide-up',
    'zoom',
  ]).default('fade'),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  background: z.string().optional(),
  class: z.string().optional(),
  notes: z.string().optional(),
  hidden: z.boolean().default(false),
});

const decks = defineCollection({
  type: 'content',
  schema: slideSchema,
});

export const collections = { decks };
