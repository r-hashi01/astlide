/** A folder / file name from free text: lowercase words joined by hyphens. */
export function slugify(text: string, fallback = "slide"): string {
	// Latin letters lose their accents (é → e); other marks (ガ's dakuten) are put back.
	const plain = text
		.normalize("NFKD")
		.replace(/(\p{Script=Latin})\p{Mark}+/gu, "$1")
		.normalize("NFKC");
	return hyphenate(plain, fallback);
}

/**
 * A template layout's name, as decks refer to it (`slideLayout`). Unlike
 * {@link slugify}, accents and other marks become hyphens (`Überblick` →
 * `u-berblick`, `ガイド` → `カ-イト`): the names decks already use keep working.
 */
export function layoutSlug(text: string, fallback = "layout"): string {
	return hyphenate(text.normalize("NFKD"), fallback);
}

function hyphenate(text: string, fallback: string): string {
	const slug = text
		.toLowerCase()
		.replace(/[^\p{Letter}\p{Number}]+/gu, "-")
		// Hyphens come one at a time now.
		.replace(/^-|-$/g, "")
		.slice(0, 48)
		.replace(/-$/, "");
	return slug || fallback;
}
