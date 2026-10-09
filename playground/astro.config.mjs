import astlide from "@astlide/core";
import { defineConfig } from "astro/config";

export default defineConfig({
	// Optional sub-path (e.g. "/astlide" on GitHub Pages). CI builds with one to
	// check that every internal link honours Astro's `base`.
	base: process.env.ASTLIDE_BASE || undefined,
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
				"goto",
				"draw",
				"laser",
				"camera",
				"record",
				"presenter",
				"fullscreen",
				"download",
			],
			slideDecorators: ["./src/components/DeckFooter.astro"],
		}),
	],
});
