import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
	readFileSync(new URL(`../src/styles/${name}`, import.meta.url), "utf-8");
const css = read("deck.css");

/** A selector list's selectors (commas inside `:is(…)` / `:not(…)` don't split). */
function splitList(list: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < list.length; i++) {
		if (list[i] === "(") depth++;
		else if (list[i] === ")") depth--;
		else if (list[i] === "," && depth === 0) {
			parts.push(list.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(list.slice(start));
	return parts;
}

/** Every rule's selectors, outside @keyframes (a small parser: deck.css has no strings with braces). */
function selectors(source: string): string[] {
	const out: string[] = [];
	const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
	const stack: string[] = [];
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === "{") {
			const head = text.slice(start, i).trim();
			stack.push(head);
			const inKeyframes = stack.some((h) => /^@[\w-]*keyframes/.test(h));
			if (!head.startsWith("@") && !inKeyframes)
				for (const s of splitList(head)) out.push(s.trim());
			start = i + 1;
		} else if (c === "}") {
			stack.pop();
			start = i + 1;
		} else if (c === ";") start = i + 1;
	}
	return out;
}

describe("deck.css", () => {
	it("keeps every rule away from slide content", () => {
		const all = selectors(css);
		expect(all.length).toBeGreaterThan(100);
		// html / body themselves can't be inside a slide.
		const rootSubject = /(^|\s)(html|body)(\[[^\]]*\]|:[\w-]+)*$/;
		const unscoped = all.filter((s) => !s.includes(":not(.slide *)") && !rootSubject.test(s));
		expect(unscoped).toEqual([]);
	});
});

describe("slide.css", () => {
	it("keeps the rules for the slide's own elements off slide content", () => {
		const all = selectors(read("slide.css"));
		expect(all.filter((s) => s.includes(":not(.slide-content *)")).length).toBeGreaterThan(10);
		// A rule whose subject is the slide's own markup must carry the guard.
		const subject = (s: string) => s.split(/\s*[ >+~]\s*/).at(-1) ?? "";
		const own =
			/^\.(slide|slide-content|astlide-tpl-art|astlide-tpl-number)(?![\w-])|^\.slide-[\w-]+$/;
		const unguarded = all.filter(
			(s) =>
				own.test(subject(s).replace(/:not\(\.slide-content \*\)$/, "")) &&
				!s.includes(":not(.slide-content *)"),
		);
		expect(unguarded).toEqual([]);
	});
});
