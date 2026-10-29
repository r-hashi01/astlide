/**
 * A slide: the `<section class="slide …">` of an Astlide site around its
 * content (style with `@astlide/core/styles/slide.css`).
 *
 * @module
 */

import { type SlideShellProps, slideShell } from "@astlide/core/runtime/slide";
import { defineComponent, h, type PropType } from "vue";

export const Slide = defineComponent({
	name: "Slide",
	props: {
		layout: String,
		transition: String,
		background: String,
		className: String,
		slideNumber: Number,
		totalSlides: Number,
		template: Object as PropType<SlideShellProps["template"]>,
		resolveUrl: Function as PropType<(path: string) => string>,
		/** The content as HTML (a Markdown, HTML or PowerPoint slide from `readDeck`). */
		html: String,
	},
	setup(props, { slots }) {
		return () => {
			const shell = slideShell(props);
			return h(
				"section",
				{
					class: shell.classes.join(" "),
					"data-transition": shell.transition,
					// Only with a background: Vue would write an empty style attribute.
					...(shell.style ? { style: shell.style } : {}),
					role: "region",
					"aria-roledescription": "slide",
					"aria-label": shell.ariaLabel,
				},
				[
					shell.templateArt
						? h("div", { class: "astlide-tpl-art", innerHTML: shell.templateArt })
						: null,
					props.html === undefined
						? h("div", { class: "slide-content" }, slots.default?.())
						: h("div", { class: "slide-content", innerHTML: props.html }),
					shell.templateNumber
						? h("div", { class: "astlide-tpl-number" }, String(props.slideNumber ?? ""))
						: null,
					slots.decorations?.(),
				],
			);
		};
	},
});
