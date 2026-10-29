/**
 * The pages of a deck, the same in every framework: which slide is page `n`,
 * where ←/→, Home and End go, the go-to outline, the deck context, and the
 * slides of the print view. Pure (no Node, no DOM): for build time, the
 * server and the browser.
 *
 * Hidden slides (`hidden: true`) keep their number. With `showHidden`
 * (development) they are pages like any other. Without it, their page sends
 * the browser on to the next visible slide, navigation and the outline skip
 * them, and the print view leaves them out.
 *
 * @module @astlide/core/deck/pages
 */

import type { DeckContext } from "../context";
import type { DeckConfig, SlideData } from "../schema";

/** What these functions read of a slide (a `DeckSlide`, or an Astro collection entry). */
export interface PageSlide {
	data: Pick<SlideData, "hidden"> & Partial<Pick<SlideData, "slideLayout" | "transition">>;
	/** Frontmatter `title`, else the first heading. */
	title?: string;
}

export interface DeckPagesOptions {
	/** Hidden slides are pages like the others (development). Default false. */
	showHidden?: boolean;
}

/** Page `number` of a deck. */
export interface SlidePage<S extends PageSlide = PageSlide> {
	slide: S;
	/** 1-based; hidden slides count. */
	number: number;
	totalSlides: number;
	/** Set for a hidden slide (without `showHidden`): the page to send the browser to. */
	redirectTo?: number;
	/** Where navigation goes from here (`null`: nowhere). */
	prevSlide: number | null;
	nextSlide: number | null;
	firstSlide: number;
	lastSlide: number;
	/** The go-to dialog's list (`g`). */
	outline: { n: number; title: string }[];
	/** Published to the slide's components (`getDeckContext` / `getClientDeckContext`). */
	deckContext: DeckContext;
}

const shown = (s: PageSlide, options: DeckPagesOptions) => options.showHidden || !s.data.hidden;

/** Page `number` (1-based) of a deck, or null when there's no such slide. */
export function slidePage<S extends PageSlide>(
	deck: { name: string; config: DeckConfig; slides: S[] },
	number: number,
	options: DeckPagesOptions = {},
): SlidePage<S> | null {
	const slide = Number.isInteger(number) ? deck.slides[number - 1] : undefined;
	if (!slide) return null;
	const visitable = deck.slides.flatMap((s, i) => (shown(s, options) ? [i + 1] : []));
	const total = deck.slides.length;
	return {
		slide,
		number,
		totalSlides: total,
		...(shown(slide, options)
			? {}
			: // The next visible slide, else the first, else slide 1.
				{ redirectTo: visitable.find((v) => v > number) ?? visitable[0] ?? 1 }),
		prevSlide: visitable.filter((v) => v < number).at(-1) ?? null,
		nextSlide: visitable.find((v) => v > number) ?? null,
		firstSlide: visitable[0] ?? 1,
		lastSlide: visitable.at(-1) ?? total,
		outline: deck.slides.flatMap((s, i) =>
			shown(s, options) ? [{ n: i + 1, title: s.title ?? `Slide ${i + 1}` }] : [],
		),
		deckContext: {
			deck: deck.name,
			slideNumber: number,
			totalSlides: total,
			layout: slide.data.slideLayout ?? "default",
			transition: slide.data.transition ?? "fade",
			config: deck.config,
		},
	};
}

/** The slides of the print view (PDF, PPTX, printing): the visible ones, in order. */
export function printSlides<S extends PageSlide>(slides: S[]): S[] {
	return slides.filter((s) => !s.data.hidden);
}
