/** A slide page: `<DeckPage>` driven by Nuxt's router, the presenter window from the URL. */

import { slidePage } from "@astlide/core/deck/pages";
import { themeName } from "@astlide/core/deck/print-view";
import { slideUrl } from "@astlide/core/runtime/page";
import { DeckPage, Slide } from "@astlide/vue";
import { defineComponent, h, onMounted, ref } from "vue";
import { createError, navigateTo, useHead, useRoute, useRuntimeConfig } from "#app";
import { findDeck, mermaidLoader, options, useMdxComponents } from "../shared";

/** The toolbar's PDF download (`@astlide/crispdf`, loaded when it's clicked). */
const loadPdfExport = () => import("@astlide/core/runtime/pdf-export");

export default defineComponent({
	name: "AstlideSlidePage",
	async setup() {
		// Nuxt's composables before the first `await` (they need the component).
		const route = useRoute();
		const deck = findDeck(route.params.deck);
		const page = slidePage(deck, Number(route.params.slide), { showHidden: options.showHidden });
		if (!page)
			throw createError({ statusCode: 404, statusMessage: "Slide not found", fatal: true });
		if (page.redirectTo !== undefined) {
			await navigateTo(slideUrl(deck.name, page.redirectTo, options), {
				redirectCode: 302,
				replace: true,
			});
			return () => null;
		}
		const { slide, number, totalSlides } = page;
		const title = `${deck.config.title ?? deck.name} - Slide ${number}`;
		// The share picture (`ogImage`): a site path gets the app's base URL.
		let base = useRuntimeConfig().app.baseURL;
		while (base.endsWith("/")) base = base.slice(0, -1);
		const image = deck.config.ogImage;
		const shareImage = image && !/^https?:\/\//i.test(image) ? `${base}${image}` : image;
		useHead({
			title,
			htmlAttrs: { "data-theme": themeName(deck.config.theme) },
			meta: [
				{ name: "description", content: slide.description ?? title },
				{ name: "robots", content: "noindex, nofollow" },
				{ name: "twitter:card", content: shareImage ? "summary_large_image" : "summary" },
				...(shareImage
					? [
							{ property: "og:image", content: shareImage },
							{ name: "twitter:image", content: shareImage },
						]
					: []),
			],
		});
		const components = useMdxComponents();
		// The presenter window is `?presenter` (or the popup): known on the client only.
		const presenter = ref(false);
		const loadMermaid = ref<ReturnType<typeof mermaidLoader>>(null);
		onMounted(() => {
			presenter.value = "presenter" in route.query || window.name === "astlide-presenter";
			loadMermaid.value = mermaidLoader();
		});
		const navigate = (url: string, { replace }: { replace: boolean }) => {
			void navigateTo(url, { replace });
		};

		const content = await slide.load();
		const Content = content.default;
		return () =>
			h(
				DeckPage,
				{
					deck: deck.name,
					slideNumber: number,
					totalSlides,
					prevSlide: page.prevSlide,
					nextSlide: page.nextSlide,
					firstSlide: page.firstSlide,
					lastSlide: page.lastSlide,
					basePath: options.basePath,
					trailingSlash: options.trailingSlash,
					toolbar: options.toolbar,
					outline: page.outline,
					notesHtml: content.notesHtml,
					deckContext: page.deckContext,
					presenter: presenter.value,
					navigate,
					loadPdfExport,
					...(loadMermaid.value ? { loadMermaid: loadMermaid.value } : {}),
				},
				() =>
					h(
						Slide,
						{
							layout: slide.data.slideLayout,
							transition: slide.data.transition,
							background: slide.data.background,
							className: slide.data.class,
							slideNumber: number,
							totalSlides,
							...(Content ? {} : { html: content.html ?? "" }),
						},
						Content ? () => h(Content, { components }) : undefined,
					),
			);
	},
});
