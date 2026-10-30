import {
	CAMERA_BUBBLE,
	deckChromeAfter,
	deckChromeBefore,
	SLIDE_OVERLAYS,
} from "@astlide/core/runtime/chrome";
import { renderSlideHtml } from "@astlide/core/runtime/slide";
import { parseFragment, serialize } from "parse5";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeckPage, Slide } from "../src/index";

type Node = {
	nodeName: string;
	value?: string;
	attrs?: { name: string; value: string }[];
	childNodes?: Node[];
};

/** Canonical HTML: attribute order, whitespace, React's style spacing and boolean attributes. */
function canon(html: string): string {
	const root = parseFragment(html) as unknown as Node;
	const walk = (n: Node) => {
		n.attrs?.sort((a, b) => a.name.localeCompare(b.name));
		for (const a of n.attrs ?? [])
			if (a.name === "style") a.value = a.value.replace(/\s*([:;])\s*/g, "$1").replace(/;$/, "");
		if (n.nodeName === "#text" && n.value) n.value = n.value.replace(/\s+/g, " ");
		n.childNodes = (n.childNodes ?? []).filter(
			(c) => !(c.nodeName === "#text" && !c.value?.trim()),
		);
		for (const c of n.childNodes) walk(c);
	};
	walk(root);
	return serialize(root as never).replace(/=""/g, "");
}

const props = {
	deck: "q3",
	slideNumber: 2,
	totalSlides: 4,
	toolbar: [
		"home",
		"prev",
		"counter",
		"next",
		"spacer",
		"notes",
		"draw",
		"overview",
		"presenter",
		"download",
	],
	notesHtml: "<p>Say <strong>hi</strong></p>",
};
const slide = { layout: "cover", slideNumber: 2, totalSlides: 4 };
const chrome = {
	currentSlide: 2,
	totalSlides: 4,
	prevSlide: 1,
	nextSlide: 3,
	toolbar: props.toolbar,
	slideHref: (n: number, q = "") => `/q3/${n}${q}`,
	homeHref: "/",
	notesHtml: props.notesHtml,
	noNotesText: "No notes for this slide.",
};
const scaler = (inner: string) =>
	`<div class="slide-scaler" id="slide-scaler" tabindex="-1">${inner}${SLIDE_OVERLAYS}</div>`;

describe("<DeckPage>", () => {
	it("renders the markup of @astlide/core/runtime/chrome around the slide", () => {
		const react = renderToStaticMarkup(
			createElement(DeckPage, props, createElement(Slide, slide, createElement("h1", null, "Q3"))),
		);
		const core =
			deckChromeBefore(chrome) +
			`<main class="presentation" aria-label="Slide presentation">${scaler(renderSlideHtml(slide, "<h1>Q3</h1>"))}</main>` +
			CAMERA_BUBBLE +
			deckChromeAfter(chrome);
		expect(canon(react)).toBe(canon(core));
	});

	it("puts the slide in the presenter panel for the presenter window", () => {
		const html = renderToStaticMarkup(
			createElement(DeckPage, { ...props, presenter: true }, createElement(Slide, slide, "x")),
		);
		const doc = parseFragment(`<body>${html}</body>`);
		const text = serialize(doc);
		expect(text).toMatch(/<div class="presenter-current"><div class="slide-scaler"/);
		expect(text).toMatch(/<main class="presentation"[^>]*><\/main>/);
	});

	it("says when notes aren't published, and disables links past the ends", () => {
		const html = renderToStaticMarkup(
			createElement(
				DeckPage,
				{ ...props, slideNumber: 1, notesHtml: undefined, notesPublished: false },
				createElement(Slide, slide, "x"),
			),
		);
		expect(html).toContain("Speaker notes are not published with this deck.");
		expect(html).toContain(
			'<button type="button" class="nav-btn disabled" aria-label="Previous slide" disabled="">←</button>',
		);
	});
});
