/**
 * A slide's speaker notes as text.
 *
 * @module
 */

import { kid, kids, path } from "../ooxml/xml";
import { type Package, REL } from "./package";
import { placeholderOf } from "./placeholders";
import { paragraphsText } from "./text";

export function notesOf(pkg: Package, slidePart: string): string {
	const part = pkg.relOf(slidePart, REL.notes)?.target;
	const notes = pkg.xml(part);
	const body = kids(path(notes, "p:cSld", "p:spTree"), "p:sp").find(
		(s) => placeholderOf(s)?.type === "body",
	);
	// Paragraphs separated by a blank line (Markdown paragraphs in the notes view).
	return paragraphsText(kid(body, "p:txBody"))
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.join("\n\n");
}
