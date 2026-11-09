/**
 * Line breaking, stage 2: each word's width. Text is measured after the
 * character before it in its text node, so kerning across words counts
 * (browsers shape the whole run), then fullwidth punctuation next to
 * punctuation loses its blank half (text-spacing-trim).
 */

import type { FontRegistry } from "../text";
import type { Word } from "./items";

/** Set the widths of `words` (from segment.ts) in place. */
export function measure(words: Word[], fonts: FontRegistry): void {
	for (const word of words) {
		const style = word.style;
		if (!style || word.forcedBreak) continue;
		const { face, size, letterSpacing, features } = style;
		const before = word.before ?? "";
		word.width = before
			? fonts.width(face, size, before + word.text, letterSpacing, features) -
				fonts.width(face, size, before, letterSpacing, features)
			: fonts.width(face, size, word.text, letterSpacing, features);
	}
	trimAdjacent(words, fonts);
}

/** Fullwidth punctuation, by how `text-spacing-trim` treats it. */
const OPEN_PUNCT = /[「『（〔［｛〈《【〘〖〝]/u;
export const CLOSE_PUNCT = /[」』）〕］｝〉》】〙〗〟、。，．]/u;
const MIDDLE_PUNCT = /[・：；]/u;

/**
 * `text-spacing-trim: normal`'s trim-adjacent (CSS Text 4 §9.2): fullwidth
 * punctuation next to other punctuation loses its blank half — an opening
 * bracket after punctuation, closing punctuation before closing or middle
 * punctuation (`」「` is 1.5em, not 2em).
 */
function trimAdjacent(words: Word[], fonts: FontRegistry): void {
	const chars: { word: Word; ch: string }[] = [];
	const run = () => {
		for (const [i, { word, ch }] of chars.entries()) {
			const style = word.style;
			if (!style) continue;
			const prev = chars[i - 1]?.ch ?? "";
			const next = chars[i + 1]?.ch ?? "";
			const trim =
				(OPEN_PUNCT.test(ch) &&
					(OPEN_PUNCT.test(prev) || CLOSE_PUNCT.test(prev) || MIDDLE_PUNCT.test(prev))) ||
				(CLOSE_PUNCT.test(ch) && (CLOSE_PUNCT.test(next) || MIDDLE_PUNCT.test(next)));
			// Only a fullwidth glyph has a blank half.
			if (trim && fonts.width(style.face, style.size, ch, 0) >= style.size * 0.9)
				word.width -= style.size / 2;
		}
		chars.length = 0;
	};
	for (const word of words) {
		// White space, forced breaks and atomic inlines separate the punctuation.
		if (word.space || word.forcedBreak || word.atomic || (word.width && !word.style)) run();
		else if (word.style) for (const ch of word.text) chars.push({ word, ch });
	}
	run();
}
