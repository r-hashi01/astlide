import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { base, sidebar, site } from "./site.mjs";

// Published at https://astlide.dev/ by .github/workflows/pages.yml,
// alongside the live demo deck (/demo/) and the TypeDoc API reference
// (/api/). Agents read the docs from /llms.txt and
// /llms-full.txt (src/pages/).

export default defineConfig({
	site,
	base: base || "/",
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
			logo: { light: "./src/assets/logo.svg", dark: "./src/assets/logo-dark.svg" },
			customCss: ["./src/styles/custom.css"],
			// The picture shown when a docs page is shared (X, Slack …).
			head: [
				{ tag: "meta", attrs: { property: "og:image", content: `${site}${base}/og.png` } },
				{ tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
				{ tag: "meta", attrs: { property: "og:image:height", content: "630" } },
				{
					tag: "meta",
					attrs: {
						property: "og:image:alt",
						content: "astlide — Slides that live in your Astro site",
					},
				},
				{ tag: "meta", attrs: { name: "twitter:image", content: `${site}${base}/og.png` } },
			],
			description:
				"Slides that live in your Astro site — an Astro integration for MDX, Markdown and HTML decks, with editable PowerPoint export in your own template.",
			social: [{ icon: "github", label: "GitHub", href: "https://github.com/r-hashi01/astlide" }],
			editLink: { baseUrl: "https://github.com/r-hashi01/astlide/edit/main/docs/" },
			lastUpdated: true,
			// English stays at the root (existing URLs unchanged); Japanese lives
			// under /ja/. Pages without a translation fall back to English.
			defaultLocale: "root",
			locales: {
				root: { label: "English", lang: "en" },
				ja: { label: "日本語", lang: "ja" },
			},
			sidebar,
		}),
	],
});
