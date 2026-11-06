/**
 * The deck runtime's public types: what a host passes to `mountDeck`.
 *
 * @module
 */

import type { DeckContext } from "../context";

/** One entry of the deck outline (go-to dialog, overview). */
export interface OutlineEntry {
	n: number;
	title: string;
}

/** What the runtime needs to know about the slide page it runs on. */
export interface DeckRuntimeConfig {
	deck: string;
	currentSlide: number;
	totalSlides: number;
	prevSlide: number | null;
	nextSlide: number | null;
	firstSlide: number;
	lastSlide: number;
	/** Slide URLs end with a slash (Astro's `trailingSlash` / directory builds). */
	trailingSlash: boolean;
	/** The site's base path ("" at the domain root). */
	basePath: string;
	outline: OutlineEntry[];
	/** Published as `window.__astlide` for client scripts (see `getClientDeckContext`). */
	deckContext: DeckContext | null;
	/** Keep pen drawings in localStorage. */
	persistDrawings: boolean;
}

export interface DeckRuntimeOptions {
	/**
	 * Client-side navigation of the host framework (Next's router, Astro's
	 * ClientRouter …). Without it the runtime uses `window.__astlide_navigate`
	 * if set, else a full page load.
	 */
	navigate?: (url: string, options: { replace: boolean }) => void;
	/**
	 * In the presenter window, move the slide into the presenter panel
	 * (default). A host that renders it there itself (React) passes false: the
	 * runtime then leaves the DOM to it.
	 */
	placeSlide?: boolean;
}
