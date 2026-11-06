/**
 * Line breaking, stage 3: measured words into lines of at most `maxWidth`
 * px. Greedy, going back to the last break opportunity on the line when
 * the one right before the overflowing word isn't one; a closing bracket
 * may go half-width to fit at a line end (text-spacing-trim allow-end);
 * a word that fits nowhere breaks between characters when overflow-wrap
 * allows.
 */

import type { FontRegistry } from "../text";
import type { Line, Word } from "./items";
import { CLOSE_PUNCT } from "./measure";

/**
 * How far a line may run past its box before it breaks: Yoga rounds layout
 * to 1/64px, so a box sized to its text can come out that much narrower than
 * the text measured into it.
 */
const FIT = 1 / 32;

/**
 * Where the last break opportunity in `words` is, as the index the next
 * line starts at (0: none). Before a word: after white space or an atomic
 * inline, or at a break opportunity the word starts with; inline box edges
 * just before it go with it.
 */
function lastBreak(words: Word[]): number {
	for (let j = words.length - 1; j > 0; j--) {
		const w = words[j] as Word;
		if (isEdge(w) || w.space) continue;
		let k = j;
		while (k > 0 && isEdge(words[k - 1])) k--;
		const prev = words[k - 1];
		if (!prev) return 0;
		// The white space (or atomic inline) before decides; inside a word, the word's own style.
		const after = (prev.space || prev.atomic) && prev.wraps !== false;
		if (after || (w.breakBefore && w.wraps !== false)) return k;
	}
	return 0;
}

/** An inline box edge, or its padding / border / margin: no text of its own. */
const isEdge = (w: Word | undefined) => !!w && !w.atomic && !w.style && !w.space;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** How much a word ending in fullwidth closing punctuation can lose at a line end: its blank half. */
function closingTrim(word: Word, fonts: FontRegistry): number {
	const style = word.style;
	const last = [...word.text].pop() ?? "";
	// Closing brackets only: a full stop or comma keeps its width.
	if (!style || !CLOSE_PUNCT.test(last) || /[、。，．]/u.test(last)) return 0;
	return fonts.width(style.face, style.size, last, 0) >= style.size * 0.9 ? style.size / 2 : 0;
}

/** Lines of `words`; the first is `indent` px shorter (text-indent). */
export function fitLines(
	words: Word[],
	maxWidth: number,
	indent: number,
	fonts: FontRegistry,
): Line[] {
	const lines: Line[] = [];
	let line: Line = { words: [], width: 0 };
	/** Width for the line being filled (the first one is indented). */
	const room = () => maxWidth - (lines.length === 0 ? indent : 0);
	for (const word of words) {
		if (word.forcedBreak) {
			lines.push(line);
			line = { words: [], width: 0 };
			continue;
		}
		// text-spacing-trim's allow-end: closing punctuation ending the line may
		// go half-width to fit (the line then breaks after it).
		const endTrim = word.wraps !== false ? closingTrim(word, fonts) : 0;
		if (
			endTrim > 0 &&
			line.words.length > 0 &&
			line.width + word.width > room() + FIT &&
			line.width + word.width - endTrim <= room() + FIT
		)
			word.width -= endTrim;
		if (!word.space && line.words.length > 0 && line.width + word.width > room() + FIT) {
			// Break at the last opportunity on the line (this word included): what
			// follows it, with the inline box edges before it, moves to the next line.
			const cut = lastBreak([...line.words, word]);
			if (cut > 0) {
				const moved = line.words.splice(cut);
				line.width -= sum(moved.map((w) => w.width));
				lines.push(line);
				line = { words: moved, width: sum(moved.map((w) => w.width)) };
			}
		}
		if (word.space && !word.pre && line.words.length === 0) continue; // collapsible spaces at line start
		// overflow-wrap: break-word — a word that still doesn't fit breaks between characters.
		let rest = word;
		while (
			!rest.space &&
			rest.wraps !== false &&
			rest.style?.breakWord &&
			line.width + rest.width > room() + FIT &&
			[...rest.text].length > 1
		) {
			const style = rest.style;
			const chars = [...rest.text];
			let n = 0;
			while (
				n < chars.length &&
				line.width +
					fonts.width(
						style.face,
						style.size,
						chars.slice(0, n + 1).join(""),
						style.letterSpacing,
						style.features,
					) <=
					room() + FIT
			)
				n++;
			if (n === 0 && line.words.length > 0) {
				lines.push(line);
				line = { words: [], width: 0 };
				continue;
			}
			n = Math.max(1, n);
			const head = chars.slice(0, n).join("");
			const tail = chars.slice(n).join("");
			const hw = fonts.width(style.face, style.size, head, style.letterSpacing, style.features);
			line.words.push({ ...rest, text: head, width: hw });
			line.width += hw;
			lines.push(line);
			line = { words: [], width: 0 };
			rest = {
				...rest,
				text: tail,
				width: fonts.width(style.face, style.size, tail, style.letterSpacing, style.features),
				breakBefore: true,
			};
		}
		line.words.push(rest);
		line.width += rest.width;
	}
	if (line.words.length) lines.push(line);
	return lines;
}
