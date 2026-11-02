/**
 * What every slide page computes the same way, whatever renders it (Astro,
 * React, Vue, Next, Nuxt, the runtime): slide URLs, the neighbouring slides
 * and the "no notes" text. Pure and browser-safe.
 *
 * @module
 */

/** Where a deck's pages are: the site's base path and its trailing-slash convention. */
export interface SlideUrlOptions {
	/** The path the deck pages are under, without a trailing slash (`""` at the root). */
	basePath?: string;
	/** Page URLs end in `/`. */
	trailingSlash?: boolean;
}

/**
 * A slide page's URL: `<basePath>/<deck>/<n>`, with a trailing slash when the
 * site uses them, then `query` (`?presenter`). The deck name is URL-encoded.
 *
 * @example
 * slideUrl("q3 review", 2, { basePath: "/decks", trailingSlash: true }, "?presenter");
 * // → "/decks/q3%20review/2/?presenter"
 */
export function slideUrl(
	deck: string,
	n: number,
	{ basePath = "", trailingSlash = false }: SlideUrlOptions = {},
	query = "",
): string {
	return `${basePath}/${encodeURIComponent(deck)}/${n}${trailingSlash ? "/" : ""}${query}`;
}

/** The slides to navigate to from a slide. */
export interface SlideNeighbours {
	prevSlide: number | null;
	nextSlide: number | null;
	firstSlide: number;
	lastSlide: number;
}

/**
 * The previous, next, first and last slides: the ones given (in production
 * they skip hidden slides), else the adjacent numbers, 1 and `total`.
 */
export function slideNeighbours(
	n: number,
	total: number,
	given: Partial<SlideNeighbours> = {},
): SlideNeighbours {
	return {
		prevSlide: given.prevSlide === undefined ? (n > 1 ? n - 1 : null) : given.prevSlide,
		nextSlide: given.nextSlide === undefined ? (n < total ? n + 1 : null) : given.nextSlide,
		firstSlide: given.firstSlide ?? 1,
		lastSlide: given.lastSlide ?? total,
	};
}

/** What the notes panel says when a slide has none, or when notes aren't published. */
export function noNotesText(published: boolean): string {
	return published ? "No notes for this slide." : "Speaker notes are not published with this deck.";
}
