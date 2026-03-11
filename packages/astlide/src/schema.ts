import { z } from "astro/zod";

/**
 * Zod schema for a single slide's frontmatter.
 *
 * Use `slideLayout` (not `layout`) — Astro MDX reserves the `layout` key.
 */
export const slideSchema = z.object({
	slideLayout: z
		.enum([
			"default",
			"cover",
			"section",
			"two-column",
			"image-full",
			"image-left",
			"image-right",
			"code",
			"quote",
			"statement",
		])
		.default("default"),
	transition: z
		.enum(["none", "fade", "slide-left", "slide-right", "slide-up", "zoom"])
		.default("fade"),
	title: z.string().optional(),
	background: z.string().optional(),
	class: z.string().optional(),
	notes: z.string().optional(),
	hidden: z.boolean().default(false),
});

export type SlideData = z.infer<typeof slideSchema>;
