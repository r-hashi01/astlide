/** A folder / file / layout name from free text: lowercase words joined by hyphens. */
export function slugify(text: string, fallback = "slide"): string {
	const slug = text
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^\p{Letter}\p{Number}]+/gu, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48)
		.replace(/-+$/, "");
	return slug || fallback;
}
