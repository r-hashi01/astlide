import {
	CAMERA_BUBBLE,
	deckChromeAfter,
	deckChromeBefore,
	SLIDE_OVERLAYS,
} from "@astlide/core/runtime/chrome";
import { renderSlideHtml } from "@astlide/core/runtime/slide";
import { parseFragment, serialize } from "parse5";
import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { DeckPage, Slide } from "../src/index";

type Node = {
	nodeName: string;
	value?: string;
	attrs?: { name: string; value: string }[];
	childNodes?: Node[];
};

/** Canonical HTML: attribute order, whitespace, style spacing, Vue's fragment comments. */
function canon(html: string): string {
	const root = parseFragment(html) as unknown as Node;
	const walk = (n: Node) => {
		n.attrs?.sort((a, b) => a.name.localeCompare(b.name));
		for (const a of n.attrs ?? [])
			if (a.name === "style") a.value = a.value.replace(/\s*([:;])\s*/g, "$1").replace(/;$/, "");
		if (n.nodeName === "#text" && n.value) n.value = n.value.replace(/\s+/g, " ");
		n.childNodes = (n.childNodes ?? []).filter(
			(c) => c.nodeName !== "#comment" && !(c.nodeName === "#text" && !c.value?.trim()),
		);
		for (const c of n.childNodes) walk(c);
	};
	walk(root);
	return serialize(root as never).replace(/=""/g, "");
}

const toolbar = [
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
];
const props = {
	deck: "q3",
	slideNumber: 2,
	totalSlides: 4,
	toolbar,
	notesHtml: "<p>Say <strong>hi</strong></p>",
};
const slide = { layout: "cover", slideNumber: 2, totalSlides: 4 };
const render = (over: Record<string, unknown> = {}) =>
	renderToString(
		createSSRApp({
			render: () =>
				h(
					DeckPage,
					{ ...props, ...over },
					{ default: () => h(Slide, slide, { default: () => h("h1", "Q3") }) },
				),
		}),
	);

describe("Vue <DeckPage>", () => {
	it("renders the markup of @astlide/core/runtime/chrome around the slide", async () => {
		const chrome = {
			currentSlide: 2,
			totalSlides: 4,
			prevSlide: 1,
			nextSlide: 3,
			toolbar,
			slideHref: (n: number, q = "") => `/q3/${n}${q}`,
			homeHref: "/",
			notesHtml: props.notesHtml,
			noNotesText: "No notes for this slide.",
		};
		const core =
			deckChromeBefore(chrome) +
			`<div class="presentation" role="main" aria-label="Slide presentation"><div class="slide-scaler" id="slide-scaler" tabindex="-1">${renderSlideHtml(slide, "<h1>Q3</h1>")}${SLIDE_OVERLAYS}</div></div>` +
			CAMERA_BUBBLE +
			deckChromeAfter(chrome);
		expect(canon(await render())).toBe(canon(core));
	});

	it("puts the slide in the presenter panel for the presenter window", async () => {
		const html = canon(await render({ presenter: true }));
		expect(html).toMatch(/<div class="presenter-current"><div class="slide-scaler"/);
		expect(html).toMatch(
			/<div aria-label="Slide presentation" class="presentation" role="main"><\/div>/,
		);
	});
});
