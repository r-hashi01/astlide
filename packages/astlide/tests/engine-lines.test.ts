import { describe, expect, it } from "vitest";
import type { InlineItem } from "../src/engine/lines";
import { segment } from "../src/engine/lines/segment";
import type { InlineStyle } from "../src/engine/text";

const style = (whiteSpace: InlineStyle["whiteSpace"] = "normal") => ({ whiteSpace }) as InlineStyle;
const text = (t: string, nodeIndex = 0, ws?: InlineStyle["whiteSpace"]): InlineItem => ({
	kind: "text",
	text: t,
	style: style(ws),
	nodeIndex,
});
/** The words, with "|" before each one a line may break before. */
const cut = (items: InlineItem[]) =>
	segment(items)
		.map((w) => (w.breakBefore ? "|" : "") + (w.space ? "␣" : w.text))
		.join("");

describe("break opportunities (segment)", () => {
	it("breaks at spaces and collapses them", () => {
		expect(cut([text("  a   b ")])).toBe("a␣b␣");
	});

	it("breaks around CJK characters, with kinsoku", () => {
		// No break before 。 or 」, none after 「.
		expect(cut([text("あい。「う」")])).toBe("あ|い。|「う」");
	});

	it("lets small kana and ー start a line (line-break: normal)", () => {
		expect(cut([text("ップー")])).toBe("ッ|プ|ー");
	});

	it("breaks after a hyphen between letters", () => {
		expect(cut([text("well-known")])).toBe("well-|known");
	});

	it("finds break opportunities between text nodes", () => {
		expect(cut([text("日本", 0), text("語", 1)])).toBe("日|本|語");
		// After （ no break, even across nodes.
		expect(cut([text("あ（", 0), text("AB", 1)])).toBe("あ|（AB");
	});

	it("doesn't break nowrap text inside words", () => {
		expect(cut([text("日本語", 0, "nowrap")])).toBe("日本語");
	});

	it("keeps the character before each piece, to measure it in context", () => {
		expect(segment([text("AV")]).map((w) => w.before)).toEqual([""]);
		expect(segment([text("あい")]).map((w) => w.before)).toEqual(["", "あ"]);
	});
});
