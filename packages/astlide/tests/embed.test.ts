// @vitest-environment jsdom
/**
 * <astlide-deck> (@astlide/core/embed): URL building, message parsing, and the
 * element's side of the postMessage protocol — the deck side runs in
 * DeckLayout and is covered by e2e/embed.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AstlideDeckElement,
	defineAstlideDeck,
	parseDeckMessage,
	type SlideChangeDetail,
	slideSrc,
} from "../src/embed/index";

describe("slideSrc", () => {
	it("follows the deck URL's trailing-slash style", () => {
		expect(slideSrc("/talk/", 3)).toBe("/talk/3/");
		expect(slideSrc("/talk", 3)).toBe("/talk/3");
		expect(slideSrc("/base/talk/", 1)).toBe("/base/talk/1/");
		expect(slideSrc("https://example.com/talks/talk/", 2)).toBe(
			"https://example.com/talks/talk/2/",
		);
	});

	it("keeps a query string or hash", () => {
		expect(slideSrc("/talk/?x=1", 2)).toBe("/talk/2/?x=1");
		expect(slideSrc("/talk#a", 2)).toBe("/talk/2#a");
	});

	it("falls back to slide 1 for invalid numbers", () => {
		expect(slideSrc("/talk/", 0)).toBe("/talk/1/");
		expect(slideSrc("/talk/", Number.NaN)).toBe("/talk/1/");
		expect(slideSrc("/talk/", 2.7)).toBe("/talk/2/");
	});
});

describe("parseDeckMessage", () => {
	it("accepts slidechange messages from a deck", () => {
		expect(
			parseDeckMessage({
				source: "astlide-deck",
				type: "slidechange",
				deck: "talk",
				slide: 2,
				total: 9,
				step: 1,
				steps: 3,
			}),
		).toEqual({ deck: "talk", slide: 2, total: 9, step: 1, steps: 3 });
	});

	it("rejects anything else", () => {
		expect(parseDeckMessage(null)).toBeNull();
		expect(parseDeckMessage("slidechange")).toBeNull();
		expect(parseDeckMessage({ source: "other", type: "slidechange" })).toBeNull();
		expect(parseDeckMessage({ source: "astlide-deck", type: "hello" })).toBeNull();
	});

	it("coerces malformed fields", () => {
		expect(
			parseDeckMessage({ source: "astlide-deck", type: "slidechange", slide: "2", deck: 1 }),
		).toEqual({ deck: "", slide: 0, total: 0, step: 0, steps: 0 });
	});
});

describe("<astlide-deck>", () => {
	defineAstlideDeck();
	let el: AstlideDeckElement;

	const iframeOf = (e: AstlideDeckElement) =>
		e.shadowRoot?.querySelector("iframe") as HTMLIFrameElement;

	/** A message as the deck in the iframe would send it. */
	function fromDeck(
		detail: Partial<SlideChangeDetail>,
		{ origin = location.origin, source = iframeOf(el).contentWindow } = {},
	) {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { source: "astlide-deck", type: "slidechange", deck: "talk", ...detail },
				origin,
				source,
			}),
		);
	}

	beforeEach(() => {
		el = document.createElement("astlide-deck");
		el.setAttribute("src", "/talk/");
		el.setAttribute("start", "3");
		document.body.append(el);
	});

	afterEach(() => {
		el.remove();
		vi.restoreAllMocks();
	});

	it("is registered once, and defining it again is a no-op", () => {
		expect(customElements.get("astlide-deck")).toBe(AstlideDeckElement);
		expect(() => defineAstlideDeck()).not.toThrow();
		expect(el).toBeInstanceOf(AstlideDeckElement);
	});

	it("loads the start slide in an iframe", () => {
		const iframe = iframeOf(el);
		expect(iframe.getAttribute("src")).toBe("/talk/3/");
		expect(iframe.title).toBe("Slide deck");
		expect(el.start).toBe(3);
		expect(el.deckOrigin).toBe(location.origin);
	});

	it("reloads when src changes and names the frame from label", () => {
		el.setAttribute("label", "My talk");
		el.src = "/other";
		expect(iframeOf(el).getAttribute("src")).toBe("/other/3");
		expect(iframeOf(el).title).toBe("My talk");
	});

	it("says hello when the frame loads, to the deck's origin only", () => {
		const post = vi.spyOn(iframeOf(el).contentWindow as Window, "postMessage");
		iframeOf(el).dispatchEvent(new Event("load"));
		expect(post).toHaveBeenCalledWith({ source: "astlide-embed", type: "hello" }, location.origin);
	});

	it("queues commands until the deck reports in, then sends them", () => {
		const post = vi.spyOn(iframeOf(el).contentWindow as Window, "postMessage");
		el.next();
		el.goTo(4);
		expect(post).not.toHaveBeenCalled();
		fromDeck({ slide: 3, total: 9 });
		expect(post.mock.calls.map(([m]) => m)).toEqual([
			{ source: "astlide-embed", type: "next" },
			{ source: "astlide-embed", type: "goto", slide: 4 },
		]);
		el.prev();
		expect(post).toHaveBeenLastCalledWith(
			{ source: "astlide-embed", type: "prev" },
			location.origin,
		);
	});

	it("ignores invalid slide numbers", () => {
		const post = vi.spyOn(iframeOf(el).contentWindow as Window, "postMessage");
		fromDeck({ slide: 1, total: 9 });
		el.goTo(0);
		el.goTo(Number.NaN);
		expect(post).not.toHaveBeenCalled();
	});

	it("fires slidechange and updates its state and counter", () => {
		const seen: SlideChangeDetail[] = [];
		document.body.addEventListener("slidechange", (e) => seen.push(e.detail), { once: true });
		fromDeck({ slide: 3, total: 9, step: 1, steps: 2 });
		expect(seen).toEqual([{ deck: "talk", slide: 3, total: 9, step: 1, steps: 2 }]);
		expect([el.slide, el.total, el.step]).toEqual([3, 9, 1]);
		expect(el.shadowRoot?.querySelector(".counter")?.textContent).toBe("3 / 9");
	});

	it("ignores messages from other windows or origins", () => {
		const listener = vi.fn();
		el.addEventListener("slidechange", listener);
		fromDeck({ slide: 2 }, { source: window });
		fromDeck({ slide: 2 }, { origin: "https://evil.example" });
		expect(listener).not.toHaveBeenCalled();
		expect(el.slide).toBe(0);
	});

	it("drives the deck from its control bar and keys", () => {
		el.controls = true;
		expect(el.hasAttribute("controls")).toBe(true);
		const post = vi.spyOn(iframeOf(el).contentWindow as Window, "postMessage");
		fromDeck({ slide: 1, total: 9 });
		const button = (action: string) =>
			el.shadowRoot?.querySelector(`button[data-action="${action}"]`) as HTMLButtonElement;
		button("next").click();
		button("prev").click();
		el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		el.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
		expect(post.mock.calls.map(([m]) => (m as { type: string }).type)).toEqual([
			"next",
			"prev",
			"next",
			"last",
		]);
	});

	it("goes to the new start slide once loaded", () => {
		const post = vi.spyOn(iframeOf(el).contentWindow as Window, "postMessage");
		fromDeck({ slide: 3, total: 9 });
		el.start = 5;
		expect(post).toHaveBeenLastCalledWith(
			{ source: "astlide-embed", type: "goto", slide: 5 },
			location.origin,
		);
	});

	it("stops listening when removed", () => {
		const listener = vi.fn();
		el.addEventListener("slidechange", listener);
		const source = iframeOf(el).contentWindow;
		el.remove();
		fromDeck({ slide: 2 }, { source });
		expect(listener).not.toHaveBeenCalled();
	});
});
