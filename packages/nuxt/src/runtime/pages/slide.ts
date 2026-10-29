/** A slide page: `<DeckPage>` driven by Nuxt's router, the presenter window from the URL. */

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
		const number = Number(route.params.slide);
		const slide = deck.slides[number - 1];
		if (!slide)
			throw createError({ statusCode: 404, statusMessage: "Slide not found", fatal: true });
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
					totalSlides: deck.slides.length,
					basePath: options.basePath,
					toolbar: options.toolbar,
					outline: deck.slides.map((s, i) => ({ n: i + 1, title: s.title ?? `Slide ${i + 1}` })),
					notesHtml: content.notesHtml,
					deckContext: {
						deck: deck.name,
						slideNumber: number,
						totalSlides: deck.slides.length,
						layout: slide.data.slideLayout ?? "default",
						transition: slide.data.transition ?? "fade",
						config: deck.config,
					},
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
							totalSlides: deck.slides.length,
							...(Content ? {} : { html: content.html ?? "" }),
						},
						Content ? () => h(Content, { components }) : undefined,
					),
			);
	},
});
