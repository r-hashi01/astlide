/** What the deck pages share. */

import { decks } from "virtual:astlide-nuxt/decks";
import { createMdxComponents } from "@astlide/vue";
import { createError, useRuntimeConfig } from "#app";

export { decks, options } from "virtual:astlide-nuxt/decks";

/** The deck of a route's `deck` param, or a 404. */
export function findDeck(name: unknown) {
	const deck = decks.find((d) => d.name === name);
	if (!deck) throw createError({ statusCode: 404, statusMessage: "Deck not found", fatal: true });
	return deck;
}

/** Astlide's components for MDX slides, with root-relative URLs under the app's `baseURL`. */
export function useMdxComponents() {
	let base = useRuntimeConfig().app.baseURL;
	while (base.endsWith("/")) base = base.slice(0, -1);
	return createMdxComponents({ resolveUrl: (path) => `${base}${path}` });
}

/** `mermaid`, when the app has it (the module's `mermaid` plugin). */
export const mermaidLoader = () =>
	typeof window !== "undefined" && window.__astlide_load_mermaid
		? (window.__astlide_load_mermaid as () => Promise<never>)
		: null;
