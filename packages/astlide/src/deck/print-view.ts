/**
 * What a deck's print view (`/<deck>/all`: every slide on one page, for PDF,
 * PPTX and printing) says about itself, the same in every framework. Pure
 * (no Node, no DOM).
 *
 * - `<html>` has {@link printViewAttributes}: the deck's theme, and the
 *   flags that show every slide and fragment as printed. A page that can't
 *   set them in its markup (Next.js: the root layout owns `<html>`) sets
 *   them from a script.
 * - `<head>` has {@link printViewMeta}: the deck's title, author and theme as
 *   `<meta name="astlide:…">`. Exporters that read the page without running
 *   it (`astlide export --pptx --base-url`) take them from there with
 *   {@link readPrintViewMeta}.
 *
 * @module @astlide/core/deck/print-view
 */

/** A theme name as it may appear in an attribute (letters, digits, `-`, `_`). */
export const themeName = (theme: string | undefined): string =>
	(theme ?? "default").replace(/[^\w-]/g, "") || "default";

/** The `<html>` attributes of a print view. */
export function printViewAttributes(config: { theme?: string }): Record<string, string> {
	return { "data-theme": themeName(config.theme), "data-print": "", "data-astlide-all": "" };
}

/** What exporters read of a print view. */
export type PrintViewInfo = {
	title: string;
	author?: string;
	theme: string;
};

const META = { title: "astlide:title", author: "astlide:author", theme: "astlide:theme" } as const;

/** The `<meta>` tags of a print view: `{ name, content }` each. */
export function printViewMeta(deck: {
	name: string;
	config: { title?: string; author?: string; theme?: string };
}): { name: string; content: string }[] {
	return [
		{ name: META.title, content: deck.config.title ?? deck.name },
		...(deck.config.author ? [{ name: META.author, content: deck.config.author }] : []),
		{ name: META.theme, content: themeName(deck.config.theme) },
	];
}

/** The deck's title, author and theme from a print view's `<meta>` tags (`meta(name)` reads one). */
export function readPrintViewMeta(
	meta: (name: string) => string | undefined,
	fallback: { deck: string },
): PrintViewInfo {
	const author = meta(META.author);
	return {
		title: meta(META.title) ?? fallback.deck,
		...(author ? { author } : {}),
		theme: themeName(meta(META.theme)),
	};
}
