import { readdirSync, readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const MARK = "[data-astlide-c]";
const css = readFileSync(new URL("../src/styles/components.css", import.meta.url), "utf-8");
const components = new URL("../src/components/", import.meta.url);

describe("components.css", () => {
	it("styles components only through their marked root element", () => {
		const selectors: string[] = [];
		postcss.parse(css).walkRules((rule) => {
			if (rule.parent?.type === "atrule" && /keyframes$/.test((rule.parent as postcss.AtRule).name))
				return;
			selectors.push(...rule.selectors);
		});
		expect(selectors.length).toBeGreaterThan(30);
		expect(selectors.filter((s) => !s.includes(MARK))).toEqual([]);
	});

	it("is what the Astro components use: no styles of their own, marked roots", () => {
		const styled = [
			"Left",
			"Right",
			"Columns",
			"ImageSide",
			"TextPanel",
			"Fragment",
			"SpeakerNotes",
			"CodeBlock",
			"Math",
			"YouTube",
			"Tweet",
		];
		for (const name of readdirSync(components).filter((f) => f.endsWith(".astro"))) {
			const source = readFileSync(new URL(name, components), "utf-8");
			expect(source, name).not.toContain("<style");
			if (styled.includes(name.replace(".astro", ""))) {
				expect(source, name).toContain("@astlide/core/styles/components.css");
				expect(source, name).toContain("data-astlide-c");
			}
		}
	});
});
