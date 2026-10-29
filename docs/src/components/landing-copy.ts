/**
 * Text of the landing page (src/components/Landing.astro) below the hero, per
 * locale. The hero's title, tagline and actions come from each index page's
 * `hero` frontmatter.
 */

type Copy = {
	command: string;
	copy: string;
	copied: string;
	sourceCaption: string;
	sourceAlt: string;
	decks: { title: string; body: string; shots: { alt: string; caption: string }[] };
	templates: { title: string; body: string };
	more: { title: string; items: [string, string][]; compare: string };
	start: string;
};

export const copy: Record<"en" | "ja", Copy> = {
	en: {
		command: "Command",
		copy: "Copy command",
		copied: "Copied",
		sourceCaption: "The same file at /tour/4, in the corporate theme",
		sourceAlt: "The Markdown file above, shown as a slide",
		decks: {
			title: "Keep every deck in one site",
			body: "A deck is a folder of slide files. Put your talks, weekly reports and training decks side by side: they share themes and components, deploy together and get an index page.",
			shots: [
				{ alt: "A slide in the dark theme", caption: "talks-2026 · dark" },
				{ alt: "A slide in the forest theme", caption: "onboarding · forest" },
				{ alt: "A slide in the two-column layout", caption: "q3-review · two columns" },
				{ alt: "A slide with a diagram", caption: "q3-review · diagram" },
			],
		},
		templates: {
			title: "Use your company’s PowerPoint template",
			body: "Register a .pptx or .potx as a theme, and your Markdown slides take on its layouts, fonts and colors. Export to PowerPoint and you get real text boxes, tables and shapes, with your speaker notes, that anyone can edit. Layout happens without a browser.",
		},
		more: {
			title: "Also included",
			items: [
				[
					"Presenter window",
					"Your notes, the next slide and a timer. Pen and laser show on the audience screen too.",
				],
				[
					"Step-by-step reveals",
					"Show items one at a time with <Fragment>, and walk through code line by line.",
				],
				[
					"Diagrams and math",
					"Mermaid loads only on slides that use it. KaTeX is rendered at build time.",
				],
				["PDF and PNG", "Export from the command line, or with one button in the browser."],
				["Import", "Turn a .pptx from PowerPoint or Google Slides into slides you can edit."],
				[
					"A URL per slide",
					"Every slide is a static page you can link to. Host it anywhere, sub-paths included.",
				],
			],
			compare: "How Astlide compares to Slidev, Marp, reveal.js and Quarto",
		},
		start: "Make your first deck",
	},
	ja: {
		command: "コマンド",
		copy: "コマンドをコピー",
		copied: "コピーしました",
		sourceCaption: "このファイルを corporate テーマで表示したもの（/tour/4）",
		sourceAlt: "上の Markdown ファイルをスライドとして表示したもの",
		decks: {
			title: "デッキをいくつでも 1 つのサイトに",
			body: "デッキは、スライドのファイルを入れたフォルダーです。登壇資料も週次報告も研修資料も同じサイトに置けば、テーマやコンポーネントを使い回せて、デプロイも 1 回で済みます。デッキの一覧ページも自動で作られます。",
			shots: [
				{ alt: "dark テーマのスライド", caption: "talks-2026 · dark" },
				{ alt: "forest テーマのスライド", caption: "onboarding · forest" },
				{ alt: "2 段組みレイアウトのスライド", caption: "q3-review · 2 段組み" },
				{ alt: "図の入ったスライド", caption: "q3-review · 図" },
			],
		},
		templates: {
			title: "会社の PowerPoint テンプレートをそのまま使える",
			body: "テンプレート（.pptx / .potx）をテーマとして登録すると、Markdown のスライドがテンプレートのレイアウト・フォント・色で表示されます。PowerPoint に書き出せば、文字も表も図形も PowerPoint 上でそのまま編集でき、発表者ノートも付いてきます。レイアウトの計算にブラウザは使いません。",
		},
		more: {
			title: "そのほかの機能",
			items: [
				[
					"発表者ウィンドウ",
					"発表者ノート、次のスライド、経過時間を手元に表示します。ペンやレーザーポインターは聴衆側の画面にも映ります。",
				],
				[
					"段階表示",
					"<Fragment> で項目を 1 つずつ表示できます。コードも 1 行ずつ順に強調できます。",
				],
				[
					"図と数式",
					"Mermaid の図は、使うスライドでだけ読み込みます。KaTeX の数式はビルド時に描画します。",
				],
				["PDF と PNG", "コマンドラインからも、ブラウザのボタン 1 つでも書き出せます。"],
				[
					"取り込み",
					"PowerPoint や Google スライドの .pptx を、編集できるスライドに変換できます。",
				],
				[
					"スライドごとの URL",
					"スライドは 1 枚ずつ静的なページになるので、直接リンクできます。サブパスも含め、どこにでも公開できます。",
				],
			],
			compare: "Slidev・Marp・reveal.js・Quarto との比較",
		},
		start: "最初のデッキを作ってみる",
	},
};

export const sources = {
	slide: `---
slideLayout: default
---

# A plain Markdown slide

- Lists, **emphasis**, \`code\` and [links](https://astro.build)
- Tables and blockquotes
- Code fences with line highlighting:`,
	decks: `src/content/decks/
├─ q3-review/
│  ├─ _config.json  { "theme": "brand" }
│  ├─ 01-cover.mdx
│  └─ 02-numbers.md
├─ onboarding/
└─ talks-2026/`,
	config: `import astlide from "@astlide/astro";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    astlide({
      templates: { brand: "./templates/brand.pptx" },
    }),
  ],
});`,
};
