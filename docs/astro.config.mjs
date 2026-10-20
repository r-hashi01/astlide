import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { base, sidebar, site } from "./site.mjs";

// Published at https://r-hashi01.github.io/astlide/ by .github/workflows/pages.yml,
// alongside the live demo deck (/astlide/demo/) and the TypeDoc API reference
// (/astlide/api/). Agents read the docs from /astlide/llms.txt and
// /astlide/llms-full.txt (src/pages/).

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
				"Slides that live in your Astro site — an Astro integration for MDX, Markdown and HTML decks, with editable PowerPoint export in your own template.",
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
			sidebar,
		}),
	],
});
