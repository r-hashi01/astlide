import { z } from "astro/zod";

/** All built-in theme names. Used for both schema validation and type-safe IDE completion. */
export const THEMES = [
	"default",
	"dark",
	"minimal",
	"corporate",
	"gradient",
	"rose",
	"forest",
] as const;

export type Theme = (typeof THEMES)[number];

/**
 * Zod schema for a deck's `_config.json` file.
 *
 * Place `_config.json` in `src/content/decks/<deck-name>/` to configure the deck.
 * All fields are optional; `theme` defaults to `"default"`.
 *
 * @example
 * ```json
 * { "title": "My Talk", "author": "Alice", "date": "2025-06-01", "theme": "dark" }
 * ```
 */
export const deckConfigSchema = z.object({
	/** Deck title shown on the index page and browser tab. Falls back to the deck directory name if omitted. */
	title: z.string().optional(),
	/** Presenter / author name shown on the index page. */
	author: z.string().optional(),
	/** ISO date string (e.g. `"2025-06-01"`) shown on the index page. */
	date: z.string().optional(),
	/**
	 * Visual theme applied to all slides in the deck.
	 * Built-in themes plus any plugin-contributed theme names are valid.
	 * Unknown names are warned at runtime in dev mode.
	 */
	theme: z.string().default("default"),
});

export type DeckConfig = z.infer<typeof deckConfigSchema>;

/**
 * Zod schema for a single slide's frontmatter.
 *
 * Use `slideLayout` (not `layout`) — Astro MDX reserves the `layout` key.
 */
/** Built-in slide layout names. Plugin-contributed layouts may also be used (validated at runtime). */
export const BUILT_IN_LAYOUT_NAMES = [
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
] as const;

/** Built-in transition names. Plugin-contributed transitions may also be used. */
export const BUILT_IN_TRANSITION_NAMES = [
	"none",
	"fade",
	"slide-left",
	"slide-right",
	"slide-up",
	"zoom",
] as const;

export const slideSchema = z.object({
	// Strings are accepted to allow plugin-contributed layouts/transitions.
	// Unknown names trigger a dev-only warning at render time but do not fail validation.
	slideLayout: z.string().default("default"),
	transition: z.string().default("fade"),
	title: z.string().optional(),
	background: z
		.string()
		.refine(
			(val) => {
				const lower = val.toLowerCase().replace(/\s+/g, " ").trim();
				// Block dangerous CSS patterns
				if (/expression\s*\(/i.test(lower)) return false;
				if (/url\s*\(\s*["']?\s*javascript:/i.test(lower)) return false;
				if (/url\s*\(\s*["']?\s*vbscript:/i.test(lower)) return false;
				if (/url\s*\(\s*["']?\s*data:\s*(?:text\/html|image\/svg)/i.test(lower)) return false;
				if (/@import/i.test(lower)) return false;
				if (/behavior\s*:/i.test(lower)) return false;
				if (lower.includes("{") || lower.includes("}")) return false;
				return true;
			},
			{
				message: "Invalid background value: contains potentially dangerous CSS patterns",
			},
		)
		.optional(),
	class: z.string().optional(),
	notes: z.string().optional(),
	hidden: z.boolean().default(false),
});

export type SlideData = z.infer<typeof slideSchema>;
