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
		sourceCaption: "/tour/4 in the corporate theme",
		sourceAlt: "The Markdown file above, rendered as a slide",
		decks: {
			title: "A folder per deck, one site for all of them",
			body: "A year of talks, a team’s weekly reports, the onboarding decks. They share themes and components, deploy together and get an index page.",
			shots: [
				{ alt: "A slide in the dark theme", caption: "talks-2026 · dark" },
				{ alt: "A slide in the forest theme", caption: "onboarding · forest" },
				{ alt: "A slide in the two-column layout", caption: "q3-review · two columns" },
				{ alt: "A slide with a diagram", caption: "q3-review · diagram" },
			],
		},
		templates: {
			title: "Your PowerPoint template in, editable PowerPoint out",
			body: "Register a .pptx or .potx as a theme. Headings land in its title placeholders and the rest in its body, in its fonts and colors. The export writes real text boxes, tables and shapes with your speaker notes, laid out without a browser.",
		},
		more: {
			title: "Also in the box",
			items: [
				[
					"Presenter window",
					"Next slide, notes, timer, pen and laser, mirrored to the audience screen.",
				],
				["Reveals", "<Fragment> steps, and code that highlights line by line."],
				[
					"Diagrams and math",
					"Mermaid, loaded when a slide needs it. KaTeX, rendered at build time.",
				],
				["PDF and PNG", "From the command line, or with one click in the browser."],
				["Import", "A .pptx from PowerPoint or Google Slides becomes editable HTML slides."],
				["Static pages", "Every slide has a URL. Host it anywhere, sub-paths included."],
			],
			compare: "How it compares to Slidev, Marp, reveal.js and Quarto",
		},
		start: "Start with a deck of your own",
	},
	ja: {
		command: "コマンド",
		copy: "コマンドをコピー",
		copied: "コピーしました",
		sourceCaption: "/tour/4 を corporate テーマで表示",
		sourceAlt: "上の Markdown ファイルをスライドとして表示したもの",
		decks: {
			title: "デッキはフォルダ 1 つ。全部を 1 つのサイトに",
			body: "1 年分の登壇資料、チームの週次報告、新人研修のデッキ。テーマとコンポーネントを共有して、まとめてデプロイでき、一覧ページも付いてきます。",
			shots: [
				{ alt: "dark テーマのスライド", caption: "talks-2026 · dark" },
				{ alt: "forest テーマのスライド", caption: "onboarding · forest" },
				{ alt: "2 段組みレイアウトのスライド", caption: "q3-review · 2 段組み" },
				{ alt: "図の入ったスライド", caption: "q3-review · 図" },
			],
		},
		templates: {
			title: "自社の PowerPoint テンプレートで書き、編集できる PowerPoint で渡す",
			body: ".pptx か .potx をテーマとして登録すると、見出しはテンプレートのタイトル枠に、それ以外は本文の枠に入り、テンプレートのフォントと色で表示されます。書き出したファイルは本物のテキストボックス・表・図形でできていて、発表者ノートも入ります。レイアウトの計算にブラウザは使いません。",
		},
		more: {
			title: "ほかにも入っているもの",
			items: [
				[
					"発表者ウィンドウ",
					"次のスライド、ノート、タイマー、ペンとレーザー。操作は聴衆側の画面にも映ります。",
				],
				["段階表示", "<Fragment> で順に表示できます。コードも 1 行ずつハイライトできます。"],
				["図と数式", "Mermaid は必要なスライドでだけ読み込み、KaTeX はビルド時に描画します。"],
				["PDF と PNG", "コマンドラインからでも、ブラウザのボタン 1 つでも書き出せます。"],
				[
					"取り込み",
					"PowerPoint や Google スライドの .pptx を、編集できる HTML スライドにします。",
				],
				[
					"静的なページ",
					"スライド 1 枚ごとに URL があります。サブパスを含めて、どこにでも置けます。",
				],
			],
			compare: "Slidev・Marp・reveal.js・Quarto との比較",
		},
		start: "自分のデッキを作ってみる",
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
	config: `import astlide from "@astlide/core";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    astlide({
      templates: { brand: "./templates/brand.pptx" },
    }),
  ],
});`,
};
