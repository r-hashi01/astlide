/** A slide page: `<DeckPage>` driven by Nuxt's router, the presenter window from the URL. */

import { slidePage } from "@astlide/core/deck/pages";
import { DeckPage, Slide } from "@astlide/vue";
import { defineComponent, h, onMounted, ref } from "vue";
import { createError, navigateTo, useHead, useRoute } from "#app";
import { findDeck, mermaidLoader, options, themeOf, useMdxComponents } from "../shared";

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
			await navigateTo(`${options.basePath}/${encodeURIComponent(deck.name)}/${page.redirectTo}`, {
				redirectCode: 302,
				replace: true,
			});
			return () => null;
		}
		const { slide, number, totalSlides } = page;
		const title = `${deck.config.title ?? deck.name} - Slide ${number}`;
		useHead({
			title,
			htmlAttrs: { "data-theme": themeOf(deck.config.theme) },
			meta: [
				{ name: "description", content: slide.description ?? title },
				{ name: "robots", content: "noindex, nofollow" },
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
					toolbar: options.toolbar,
					outline: page.outline,
					notesHtml: content.notesHtml,
					deckContext: page.deckContext,
					presenter: presenter.value,
					navigate,
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
