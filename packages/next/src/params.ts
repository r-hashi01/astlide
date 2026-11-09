/**
 * The deck a `[deck]` param names. Next passes the param as it is in the URL
 * (`50%25%20off`) or decoded (`50% off`), depending on the render; a name with
 * a `%` that isn't an escape can't be decoded at all.
 */
export function deckByParam<D extends { name: string }>(decks: D[], param: string): D | undefined {
	const exact = decks.find((d) => d.name === param);
	if (exact) return exact;
	let decoded: string;
	try {
		decoded = decodeURIComponent(param);
	} catch {
		return undefined;
	}
	return decks.find((d) => d.name === decoded);
}
