import { describe, expect, it } from "vitest";
import {
	CAMERA_BUBBLE,
	type DeckChromeProps,
	deckChromeAfter,
	deckChromeBefore,
	SLIDE_OVERLAYS,
} from "../src/runtime/chrome";

const props = (over: Partial<DeckChromeProps> = {}): DeckChromeProps => ({
	currentSlide: 2,
	totalSlides: 4,
	prevSlide: 1,
	nextSlide: 3,
	toolbar: ["home", "prev", "counter", "next", "spacer", "notes", "draw", "nope"],
	slideHref: (n, q = "") => `/talk/${n}/${q}`,
	homeHref: "/",
	noNotesText: "No notes for this slide.",
	...over,
});

describe("deck chrome", () => {
	it("renders the progress bar and the presenter panel for the slide", () => {
		const html = deckChromeBefore(props());
		expect(html).toContain('style="width: 50%"');
		expect(html).toContain('aria-valuenow="2"');
		expect(html).toContain('<span class="presenter-counter">2 / 4</span>');
		expect(html).toContain('<a href="/talk/1/?presenter" class="pnav-btn">← Prev</a>');
		expect(html).toContain('<div class="presenter-next-frame"></div>');
		expect(html).toContain('<p class="no-notes">No notes for this slide.</p>');
	});

	it("disables links past the ends and marks the end of the deck", () => {
		const before = deckChromeBefore(props({ prevSlide: null, nextSlide: null, currentSlide: 4 }));
		expect(before).toContain(
			'<a class="pnav-btn disabled" aria-disabled="true" tabindex="-1">← Prev</a>',
		);
		expect(before).toContain('<p class="presenter-next-end">End of deck</p>');
		const after = deckChromeAfter(props({ prevSlide: null }));
		expect(after).toContain(
			'<a class="nav-btn disabled" aria-label="Previous slide" aria-disabled="true" tabindex="-1">←</a>',
		);
	});

	it("renders the toolbar in order, skipping unknown items", () => {
		const nav = deckChromeAfter(props()).match(/<nav[^>]*>(.*?)<\/nav>/)?.[1] ?? "";
		const items = [
			...nav.matchAll(/(?:aria-label="([^"]+)"|class="(nav-indicator|nav-spacer)")/g),
		].map((m) => m[1] ?? m[2]);
		expect(items).toEqual([
			"Back to deck index",
			"Previous slide",
			"nav-indicator",
			"Next slide",
			"nav-spacer",
			"Toggle speaker notes",
			"Toggle drawing",
		]);
		expect(nav).toContain('data-action="draw" aria-label="Toggle drawing" aria-pressed="false"');
	});

	it("puts sanitized notes in both places, and escapes the text it writes itself", () => {
		const notes = "<p>Say <strong>hi</strong></p>";
		expect(deckChromeBefore(props({ notesHtml: notes }))).toContain(
			`<div class="notes-content">${notes}</div>`,
		);
		expect(deckChromeAfter(props({ notesHtml: notes }))).toContain(
			`<div class="notes-body">${notes}</div>`,
		);
		const hostile = deckChromeAfter(
			props({ noNotesText: "<img src=x onerror=alert(1)>", homeHref: '/"><script>' }),
		);
		expect(hostile).not.toContain("<img");
		expect(hostile).not.toContain("<script>");
		expect(hostile).toContain('href="/&quot;&gt;&lt;script&gt;"');
	});

	it("has the elements the runtime looks up", () => {
		const page =
			deckChromeBefore(props()) + SLIDE_OVERLAYS + CAMERA_BUBBLE + deckChromeAfter(props());
		for (const id of [
			"slide-announcer",
			"presenter-timer",
			"timer-btn",
			"timer-reset",
			"presenter-steps-left",
			"draw-layer",
			"laser-dot",
			"astlide-camera",
			"astlide-recording-time",
			"notes-overlay",
			"notes-close",
			"pdf-overlay",
			"pdf-overlay-bar",
			"pdf-overlay-status",
			"overview",
			"overview-grid",
			"goto",
			"goto-input",
			"goto-list",
		])
			expect(page).toContain(`id="${id}"`);
	});
});
