/**
 * Typed access to the current deck/slide metadata.
 *
 * Replaces ad-hoc discovery (parsing `document.title`, reading `body.dataset`)
 * with a first-class, typed API. Two entry points:
 *
 * - {@link getDeckContext} — **server-side** (build/SSR), for `.astro` components
 *   rendered inside a slide. Reads from `Astro.locals`.
 * - {@link getClientDeckContext} — **client-side**, for scripts that run in the
 *   browser (e.g. per-slide decorations). Reads from `window.__astlide`.
 *
 * @example Server-side, inside a slide component
 * ```astro
 * ---
 * import { getDeckContext } from '@astlide/core/context';
 * const ctx = getDeckContext(Astro);
 * ---
 * <footer>{ctx?.config.title} — {ctx?.slideNumber}/{ctx?.totalSlides}</footer>
 * ```
 */

import type { DeckConfig } from "./schema";

/** Metadata about the slide currently being rendered. */
export interface DeckContext {
	/** Deck name (the deck directory / URL segment). */
	deck: string;
	/** 1-based index of this slide within the deck. */
	slideNumber: number;
	/** Total number of slides in the deck. */
	totalSlides: number;
	/** Resolved `slideLayout` for this slide. */
	layout: string;
	/** Resolved `transition` for this slide. */
	transition: string;
	/** The deck's parsed `_config.json` (with schema defaults applied). */
	config: DeckConfig;
}

// Augment Astro's `App.Locals` so `Astro.locals.astlide` is typed everywhere the
// context module is imported. Astro types `Astro.locals` as `App.Locals` (an
// interface with no index signature), so a plain `Record<string, unknown>`
// param would reject it — this augmentation is the idiomatic, type-safe fix.
declare global {
	namespace App {
		interface Locals {
			/** Current deck/slide metadata, published by Astlide's slide route. */
			astlide?: DeckContext;
		}
	}
}

/** Shape of the `Astro` global we read/write — just the `locals` bag. */
interface HasLocals {
	locals: App.Locals;
}

/**
 * Store the deck context on `Astro.locals`. Called by Astlide's slide route;
 * app code normally only needs {@link getDeckContext}.
 */
export function setDeckContext(astro: HasLocals, ctx: DeckContext): void {
	astro.locals.astlide = ctx;
}

/**
 * Read the current {@link DeckContext} on the server (build/SSR).
 *
 * @param astro - The component's `Astro` global.
 * @returns The context, or `undefined` if called outside a slide render.
 */
export function getDeckContext(astro: HasLocals): DeckContext | undefined {
	return astro.locals.astlide;
}

/**
 * Read the current {@link DeckContext} in the browser.
 *
 * Astlide publishes the live context on `window.__astlide` for each slide, so
 * client scripts no longer need to parse the document title or `body.dataset`.
 *
 * @returns The context, or `undefined` when not running on a slide page.
 */
export function getClientDeckContext(): DeckContext | undefined {
	if (typeof window === "undefined") return undefined;
	return (window as unknown as { __astlide?: DeckContext }).__astlide;
}
