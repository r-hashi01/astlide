import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// Published at https://r-hashi01.github.io/astlide/ by .github/workflows/pages.yml,
// alongside the live demo deck (/astlide/demo/) and the TypeDoc API reference
// (/astlide/api/).
const site = "https://r-hashi01.github.io";
const base = "/astlide";

export default defineConfig({
	site,
	base,
	// Pages are directories on GitHub Pages; link them with the slash (no redirect).
	trailingSlash: "always",
	vite: {
		// Starlight needs js-yaml 4, but the workspace root hoists js-yaml 5 (for
		// @astlide/core). Left external, the bundled Starlight code would resolve the
		// root copy from docs/dist; bundling resolves it from Starlight itself.
		// (Astro 7 prerenders in its own Vite environment, hence both entries.)
		ssr: { noExternal: ["js-yaml"] },
		environments: { prerender: { resolve: { noExternal: ["js-yaml"] } } },
	},
	integrations: [
		starlight({
			title: "Astlide",
			customCss: ["./src/styles/custom.css"],
			description:
				"An Astro-based slide presentation framework — like Slidev, for the Astro ecosystem.",
			social: [{ icon: "github", label: "GitHub", href: "https://github.com/r-hashi01/astlide" }],
			editLink: { baseUrl: "https://github.com/r-hashi01/astlide/edit/main/docs/" },
			lastUpdated: true,
			// English stays at the root (existing URLs unchanged); Japanese lives
			// under /astlide/ja/. Pages without a translation fall back to English.
			defaultLocale: "root",
			locales: {
				root: { label: "English", lang: "en" },
				ja: { label: "日本語", lang: "ja" },
			},
			sidebar: [
				{ label: "Why Astlide?", translations: { ja: "なぜ Astlide？" }, slug: "why" },
				{ label: "Getting Started", translations: { ja: "はじめに" }, slug: "getting-started" },
				{ slug: "tutorial/first-deck" },
				{ slug: "gallery" },
				{
					label: "Guides",
					translations: { ja: "ガイド" },
					items: [
						{ slug: "guides/decks" },
						{ slug: "guides/layouts-and-components" },
						{ slug: "guides/fragments" },
						{ slug: "guides/code" },
						{ slug: "guides/diagrams" },
						{ slug: "guides/presenting" },
						{ slug: "guides/themes-and-plugins" },
						{ slug: "guides/export" },
						{ slug: "guides/import" },
						{ slug: "guides/templates" },
						{ slug: "guides/deploy" },
					],
				},
				{
					label: "Reference",
					translations: { ja: "リファレンス" },
					items: [
						{ slug: "reference/configuration" },
						{ slug: "reference/frontmatter" },
						{
							label: "API (TypeDoc)",
							translations: { ja: "API（TypeDoc）" },
							link: `${site}${base}/api/`,
							attrs: { target: "_blank" },
						},
					],
				},
				{
					label: "Live demo ↗",
					translations: { ja: "ライブデモ ↗" },
					link: `${site}${base}/demo/tour/1/`,
					attrs: { target: "_blank" },
				},
			],
		}),
	],
});
