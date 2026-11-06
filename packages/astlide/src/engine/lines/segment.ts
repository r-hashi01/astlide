/**
 * Line breaking, stage 1: inline items into words — white space collapsed
 * (CSS Text 3 §4) and the text cut at its break opportunities (UAX #14 for
 * the cases slides need, kinsoku for Japanese, `line-break: normal`).
 * Widths are measured next (measure.ts).
 */

import type { InlineItem, Word } from "./items";

/** Kana, CJK ideographs and symbols, Hangul, full-width forms: a line may break around each one. */
const CJK =
	/[\u2e80-\u2fff\u3000-\u30ff\u3100-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]|[\u{20000}-\u{3134f}]/u;
/** Never at the start of a line (kinsoku): closing punctuation, small kana, iteration and prolonged marks. */
const NO_BREAK_BEFORE =
	/[、。，．・：；？！‼⁇⁈⁉）〕］｝〉》」』】〙〗〟’”｠»ゝゞヽヾ々〻〜～…‥゛゜)\]}.,:;!?%]/u;
/** Never at the end of a line: opening brackets and quotes. */
const NO_BREAK_AFTER = /[（〔［｛〈《「『【〘〖〝‘“｟«([{]/u;

/**
 * A word's break opportunities (UAX #14, the cases slides need): after a
 * hyphen that follows a letter and precedes one, and around CJK characters —
 * Japanese, Chinese and Korean text has no spaces to break at — except where
 * kinsoku forbids it.
 */
/** Whether a line may break between `prev` and `ch` (`before`: the character before `prev`). */
function breakBetween(before: string, prev: string, ch: string): boolean {
	const hyphen = prev === "-" && /[^\s-]/.test(before) && /[A-Za-z]/.test(ch);
	const cjk =
		(CJK.test(prev) || CJK.test(ch)) && !NO_BREAK_BEFORE.test(ch) && !NO_BREAK_AFTER.test(prev);
	return hyphen || cjk;
}

function breakPieces(word: string): string[] {
	const chars = [...word];
	const pieces: string[] = [];
	let piece = "";
	for (const [i, ch] of chars.entries()) {
		const prev = chars[i - 1];
		if (prev !== undefined && piece !== "") {
			if (breakBetween(chars[i - 2] ?? "", prev, ch)) {
				pieces.push(piece);
				piece = "";
			}
		}
		piece += ch;
	}
	pieces.push(piece);
	return pieces;
}

/** Words for `items`, unmeasured (white space and atomic inlines carry their widths). */
export function segment(items: InlineItem[]): Word[] {
	const words: Word[] = [];
	/** The last two characters laid out (across text nodes), for break opportunities between nodes. */
	let tail = "";
	let prevSpace = true; // leading white space at the start of the block collapses away
	for (const item of items) {
		if (item.kind === "space") {
			words.push({ text: "", style: null, nodeIndex: -1, width: item.width, space: false });
			continue;
		}
		if (item.kind === "atomic") {
			// A line may break before and after one (like U+FFFC); spaces after it are kept.
			words.push({
				text: "",
				style: null,
				nodeIndex: -1,
				width: item.width,
				space: false,
				breakBefore: true,
				atomic: item,
				wraps: item.wraps,
			});
			prevSpace = false;
			continue;
		}
		if (item.kind !== "text") {
			words.push({
				text: "",
				style: null,
				nodeIndex: -1,
				width: 0,
				space: false,
				edge: { kind: item.kind, id: item.id },
			});
			continue;
		}
		const pre = /^(pre|pre-wrap|break-spaces)$/.test(item.style.whiteSpace);
		const preLine = item.style.whiteSpace === "pre-line";
		const text = pre ? item.text : item.text.replace(preLine ? /[ \t]+/g : /\s+/g, " ");
		const parts = text.split(pre || preLine ? /(\n|[ \t]+)/ : /( )/);
		/** The character before the next piece in this text node (for measuring in context). */
		let before = "";
		for (const part of parts) {
			if (part === "") continue;
			if (part === "\n") {
				words.push({
					text: "",
					style: item.style,
					nodeIndex: item.nodeIndex,
					width: 0,
					space: false,
					forcedBreak: true,
				});
				prevSpace = true;
				before = "";
				continue;
			}
			const isSpace = /^[ \t]+$/.test(part);
			if (isSpace && !pre && prevSpace) continue;
			const wraps = item.style.whiteSpace !== "pre" && item.style.whiteSpace !== "nowrap";
			const pieces = isSpace || !wraps ? [part] : breakPieces(part);
			pieces.forEach((piece, k) => {
				const chars = [...tail];
				const first = [...piece][0] ?? "";
				words.push({
					text: piece,
					style: item.style,
					nodeIndex: item.nodeIndex,
					width: 0,
					space: isSpace,
					pre,
					// A break between text nodes ("日本<b>語</b>") follows the same rules.
					breakBefore:
						k > 0 ||
						(!isSpace &&
							chars.length > 0 &&
							breakBetween(chars[chars.length - 2] ?? "", chars[chars.length - 1] ?? "", first)),
					wraps,
					before,
				});
				before = [...piece].pop() ?? before;
				tail = isSpace ? "" : [...(tail + piece)].slice(-2).join("");
			});
			prevSpace = isSpace;
		}
	}
	return words;
}
