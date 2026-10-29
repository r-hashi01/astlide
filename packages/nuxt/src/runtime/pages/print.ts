/** The print view: every slide, for PDF export and printing (exporters wait for `data-diagrams-ready`). */

import { printSlides } from "@astlide/core/deck/pages";
import { printViewAttributes, printViewMeta } from "@astlide/core/deck/print-view";
import { applyPageFlags } from "@astlide/core/runtime";
import { Slide } from "@astlide/vue";
import { defineComponent, Fragment, h, onMounted } from "vue";
import { useHead, useRoute } from "#app";
import { findDeck, mermaidLoader, useMdxComponents } from "../shared";

export default defineComponent({
	name: "AstlidePrintPage",
	async setup() {
		const deck = findDeck(useRoute().params.deck);
		useHead({
			title: deck.config.title ?? deck.name,
			htmlAttrs: printViewAttributes(deck.config),
			meta: [{ name: "robots", content: "noindex, nofollow" }, ...printViewMeta(deck)],
		});
		const components = useMdxComponents();
		onMounted(() => {
			applyPageFlags();
			void import("@astlide/core/internal/diagrams").then((m) =>
				m.renderDiagramsWith(mermaidLoader()),
			);
		});

		const slides = printSlides(deck.slides);
		const contents = await Promise.all(slides.map((s) => s.load()));
		return () =>
			h(
				Fragment,
				slides.map((slide, i) => {
					const content = contents[i] ?? {};
					const Content = content.default;
					return h(
						Slide,
						{
							key: slide.id,
							layout: slide.data.slideLayout,
							transition: slide.data.transition ?? "none",
							background: slide.data.background,
							className: slide.data.class,
							slideNumber: i + 1,
							totalSlides: slides.length,
							...(Content ? {} : { html: content.html ?? "" }),
						},
						{
							...(Content ? { default: () => h(Content, { components }) } : {}),
							...(content.notes
								? {
										decorations: () =>
											h("div", { "data-slide-notes": "meta", hidden: "" }, content.notes),
									}
								: {}),
						},
					);
				}),
			);
	},
});
