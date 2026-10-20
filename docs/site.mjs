// Where the docs are published and their sidebar — shared by astro.config.mjs
// and the llms.txt endpoints (src/pages/llms*.txt.ts), which list the pages
// in sidebar order.

export const site = "https://r-hashi01.github.io";
export const base = "/astlide";

export const sidebar = [
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
			{ slug: "guides/frameworks" },
			{ slug: "guides/fragments" },
			{ slug: "guides/code" },
			{ slug: "guides/diagrams" },
			{ slug: "guides/presenting" },
			{ slug: "guides/themes-and-plugins" },
			{ slug: "guides/export" },
			{ slug: "guides/import" },
			{ slug: "guides/templates" },
			{ slug: "guides/server" },
			{ slug: "guides/agents" },
			{ slug: "guides/deploy" },
			{ slug: "guides/embed" },
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
];
