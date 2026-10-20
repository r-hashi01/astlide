/**
 * The React / Vue wrappers of <astlide-deck>, rendered on the server (Node,
 * no DOM): importing them must not touch browser globals, and they must render
 * the custom element with its attributes.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { slideSrc } from "../src/embed/index";
import { AstlideDeck as ReactDeck } from "../src/embed/react";
import { AstlideDeck as VueDeck } from "../src/embed/vue";

describe("SSR", () => {
	it("the element module imports without a DOM", () => {
		expect(typeof HTMLElement).toBe("undefined");
		expect(slideSrc("/talk/", 2)).toBe("/talk/2/");
	});

	it("React renders <astlide-deck> with its attributes", () => {
		const html = renderToStaticMarkup(
			createElement(ReactDeck, { src: "/talk/", start: 2, controls: true, label: "Talk" }),
		);
		expect(html).toBe(
			'<astlide-deck src="/talk/" start="2" controls="" label="Talk"></astlide-deck>',
		);
	});

	it("React leaves unset attributes out", () => {
		expect(renderToStaticMarkup(createElement(ReactDeck, { src: "/talk/" }))).toBe(
			'<astlide-deck src="/talk/"></astlide-deck>',
		);
	});

	it("Vue renders <astlide-deck> with its attributes", async () => {
		const html = await renderToString(
			createSSRApp({
				render: () => h(VueDeck, { src: "/talk/", start: 2, controls: true, label: "Talk" }),
			}),
		);
		expect(html).toBe('<astlide-deck src="/talk/" start="2" controls label="Talk"></astlide-deck>');
	});

	it("Vue leaves unset attributes out", async () => {
		const html = await renderToString(
			createSSRApp({ render: () => h(VueDeck, { src: "/talk/" }) }),
		);
		expect(html).toBe('<astlide-deck src="/talk/"></astlide-deck>');
	});
});
