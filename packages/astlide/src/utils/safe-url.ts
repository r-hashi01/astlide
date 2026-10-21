/**
 * URL checks for component props that end up in `href` / `src`.
 *
 * @module
 */

/** `value` when it is an absolute `http:` / `https:` URL, else undefined. */
export function httpUrl(value: string | undefined): string | undefined {
	if (!value) return undefined;
	try {
		const { protocol } = new URL(value);
		return protocol === "http:" || protocol === "https:" ? value : undefined;
	} catch {
		return undefined;
	}
}

/**
 * `value` when it is fine as an image `src`: an `http(s)` URL, a `data:image/`
 * URL, or a path in the site (not protocol-relative). Else undefined.
 */
export function imageUrl(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const v = value.trim();
	if (/^data:image\//i.test(v)) return value;
	if (/^[a-z][a-z\d+.-]*:/i.test(v)) return httpUrl(v) && value;
	return v.startsWith("//") || v.startsWith("/\\") ? undefined : value;
}
