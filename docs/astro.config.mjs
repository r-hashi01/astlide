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
			sidebar,
		}),
	],
});
