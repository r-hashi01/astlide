/**
 * The share tags of slide pages: a deck with `ogImage` in `_config.json`
 * (the tour) gets `og:image` and a large Twitter card, one without it a
 * summary card.
 */

import { describe, expect, inject, it } from "vitest";

const head = async (path: string) => {
	const html = await (await fetch(`${inject("baseUrl")}${path}`)).text();
	return html.slice(0, html.indexOf("</head>"));
};
const meta = (html: string, key: string) =>
	html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1];

describe("share tags", () => {
	it("give a deck's ogImage to og:image and twitter:image, with a large card", async () => {
		const html = await head("/tour/1/");
		expect(meta(html, "og:image")).toMatch(/\/images\/og\.png$/);
		expect(meta(html, "twitter:image")).toBe(meta(html, "og:image"));
		expect(meta(html, "twitter:card")).toBe("summary_large_image");
	});

	it("give a deck without one a summary card and no image", async () => {
		const html = await head("/example-deck/1/");
		expect(meta(html, "og:image")).toBeUndefined();
		expect(meta(html, "twitter:card")).toBe("summary");
	});
});
