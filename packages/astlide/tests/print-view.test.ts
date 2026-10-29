import { describe, expect, it } from "vitest";
import {
	printViewAttributes,
	printViewMeta,
	readPrintViewMeta,
	themeName,
} from "../src/deck/print-view";

describe("print view contract", () => {
	it("marks <html> as the print view, in the deck's theme", () => {
		expect(printViewAttributes({ theme: "dark" })).toEqual({
			"data-theme": "dark",
			"data-print": "",
			"data-astlide-all": "",
		});
		expect(printViewAttributes({})["data-theme"]).toBe("default");
	});

	it("keeps theme names to safe characters", () => {
		expect(themeName('x"><script>')).toBe("xscript");
		expect(themeName("")).toBe("default");
	});

	it("round-trips the deck's title, author and theme through <meta> tags", () => {
		const meta = printViewMeta({
			name: "talk",
			config: { title: "My Talk", author: "Ann", theme: "rose" },
		});
		const get = (name: string) => meta.find((m) => m.name === name)?.content;
		expect(readPrintViewMeta(get, { deck: "talk" })).toEqual({
			title: "My Talk",
			author: "Ann",
			theme: "rose",
		});
	});

	it("falls back to the deck's name and the default theme", () => {
		expect(readPrintViewMeta(() => undefined, { deck: "talk" })).toEqual({
			title: "talk",
			theme: "default",
		});
		expect(printViewMeta({ name: "talk", config: {} }).map((m) => m.name)).toEqual([
			"astlide:title",
			"astlide:theme",
		]);
	});
});
