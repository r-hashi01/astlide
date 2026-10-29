import { describe, expect, it } from "vitest";
import { printSlides, slidePage } from "../src/deck/pages";
import { deckConfigSchema } from "../src/schema";

const slide = (title?: string, hidden = false) => ({ data: { hidden }, title });
// Slide 3 is hidden.
const deck = {
	name: "talk",
	config: deckConfigSchema.parse({ title: "Talk" }),
	slides: [slide("One"), slide("Two"), slide("Three", true), slide("Four"), slide()],
};

describe("slidePage", () => {
	it("keeps hidden slides' numbers and skips them in navigation and the outline", () => {
		const page = slidePage(deck, 2);
		expect(page).toMatchObject({ number: 2, totalSlides: 5, prevSlide: 1, nextSlide: 4 });
		expect(page?.redirectTo).toBeUndefined();
		expect(page?.outline.map((o) => o.n)).toEqual([1, 2, 4, 5]);
		expect(slidePage(deck, 4)).toMatchObject({
			prevSlide: 2,
			nextSlide: 5,
			firstSlide: 1,
			lastSlide: 5,
		});
	});

	it("sends a hidden slide's page on to the next visible slide", () => {
		expect(slidePage(deck, 3)?.redirectTo).toBe(4);
		const last = { ...deck, slides: [slide("A"), slide("B", true)] };
		expect(slidePage(last, 2)?.redirectTo).toBe(1);
	});

	it("shows hidden slides with showHidden (development)", () => {
		const page = slidePage(deck, 3, { showHidden: true });
		expect(page?.redirectTo).toBeUndefined();
		expect(page).toMatchObject({ prevSlide: 2, nextSlide: 4 });
		expect(page?.outline.map((o) => o.n)).toEqual([1, 2, 3, 4, 5]);
	});

	it("names untitled slides by number and fills the deck context", () => {
		const page = slidePage(deck, 5);
		expect(page?.outline.at(-1)).toEqual({ n: 5, title: "Slide 5" });
		expect(page?.deckContext).toEqual({
			deck: "talk",
			slideNumber: 5,
			totalSlides: 5,
			layout: "default",
			transition: "fade",
			config: deck.config,
		});
	});

	it("has no page outside the deck", () => {
		for (const n of [0, 6, 1.5, Number.NaN]) expect(slidePage(deck, n)).toBeNull();
	});
});

describe("printSlides", () => {
	it("leaves hidden slides out", () => {
		expect(printSlides(deck.slides).map((s) => s.title)).toEqual(["One", "Two", "Four", undefined]);
	});
});
