import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/styles/deck.css", import.meta.url), "utf-8");

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
				for (const s of head.split(",")) out.push(s.trim());
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
