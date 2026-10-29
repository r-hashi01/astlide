/** The playground's decks as a Nuxt app (`@astlide/nuxt`). */
export default defineNuxtConfig({
	compatibilityDate: "2026-10-01",
	modules: ["@astlide/nuxt"],
	pages: true,
	astlide: {
		dir: "../playground/src/content/decks",
		toolbar: ["prev", "counter", "next", "spacer", "notes", "overview", "presenter"],
	},
	app: {
		head: {
			htmlAttrs: { lang: "en" },
			link: [
				{
					rel: "stylesheet",
					href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap",
				},
			],
		},
	},
	devtools: { enabled: false },
	telemetry: false,
});
