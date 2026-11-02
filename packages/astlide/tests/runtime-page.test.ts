import { describe, expect, it } from "vitest";
import { noNotesText, slideNeighbours, slideUrl } from "../src/runtime/page";

describe("slideUrl", () => {
	it("builds a slide URL with the base path, trailing slash and query", () => {
		expect(slideUrl("talk", 3)).toBe("/talk/3");
		expect(slideUrl("talk", 3, { trailingSlash: true })).toBe("/talk/3/");
		expect(slideUrl("talk", 3, { basePath: "/decks", trailingSlash: true }, "?presenter")).toBe(
			"/decks/talk/3/?presenter",
		);
	});

	it("encodes the deck name", () => {
		expect(slideUrl("q3 review", 1)).toBe("/q3%20review/1");
		expect(slideUrl("発表", 1)).toBe("/%E7%99%BA%E8%A1%A8/1");
		expect(slideUrl("a/b?c", 1)).toBe("/a%2Fb%3Fc/1");
	});
});

describe("slideNeighbours", () => {
	it("defaults to the adjacent slides", () => {
		expect(slideNeighbours(1, 3)).toEqual({
			prevSlide: null,
			nextSlide: 2,
			firstSlide: 1,
			lastSlide: 3,
		});
		expect(slideNeighbours(3, 3)).toEqual({
			prevSlide: 2,
			nextSlide: null,
			firstSlide: 1,
			lastSlide: 3,
		});
	});

	it("keeps the ones given, null included (hidden slides skipped)", () => {
		expect(
			slideNeighbours(2, 5, { prevSlide: null, nextSlide: 4, firstSlide: 2, lastSlide: 4 }),
		).toEqual({ prevSlide: null, nextSlide: 4, firstSlide: 2, lastSlide: 4 });
	});
});

it("says whether notes are published", () => {
	expect(noNotesText(true)).toBe("No notes for this slide.");
	expect(noNotesText(false)).toBe("Speaker notes are not published with this deck.");
});
