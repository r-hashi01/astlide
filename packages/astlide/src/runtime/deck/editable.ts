/**
 * Whether a key goes to something the user is typing into or choosing in —
 * a text field, a `<select>`, an editable element — rather than to the deck.
 *
 * @module
 */

export function isEditing(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}
