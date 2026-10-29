/** The decks module made by `astlideDecksPlugin` (see `../vite.ts`). */
declare module "virtual:astlide-nuxt/decks" {
	import type { DeckConfig, SlideData } from "@astlide/core/schema";
	import type { Component } from "vue";

	export interface SlideModule {
		/** The slide's HTML (Markdown, HTML, PowerPoint). */
		html?: string;
		/** The MDX slide as a component (give it Astlide's components as `components`). */
		default?: Component;
		notes?: string;
		notesHtml?: string;
	}
	export interface NuxtDeckSlide {
		id: string;
		format: "md" | "mdx" | "html" | "pptx";
		data: SlideData;
		title?: string;
		description?: string;
		load: () => Promise<SlideModule>;
	}
	export interface NuxtDeck {
		name: string;
		config: DeckConfig;
		slides: NuxtDeckSlide[];
	}
	export const options: { basePath: string; toolbar?: string[] };
	export const decks: NuxtDeck[];
}
