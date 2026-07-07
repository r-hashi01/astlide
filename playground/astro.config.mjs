import astlide from "@astlide/core";
import { defineConfig } from "astro/config";

export default defineConfig({
	integrations: [
		astlide({
			toolbar: [
				"home",
				"prev",
				"counter",
				"next",
				"spacer",
				"notes",
				"overview",
				"presenter",
				"fullscreen",
				"download",
			],
			slideDecorators: ["./src/components/DeckFooter.astro"],
		}),
	],
});
