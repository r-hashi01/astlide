import { createDeckRoutes } from "@astlide/next";

/** The Astro playground's decks, served by Next. */
export const decks = createDeckRoutes({
	dir: "../playground/src/content/decks",
	trailingSlash: true,
	toolbar: ["prev", "counter", "next", "spacer", "notes", "overview", "presenter"],
});
