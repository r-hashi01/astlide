---
title: Nuxt
description: モジュールを 1 つ足すだけで、Astlide のデッキのフォルダを Nuxt アプリのページとして配信できます。プレゼンターウィンドウ、印刷ビュー、PDF・PPTX の書き出しもそのまま使えます。
---

`@astlide/nuxt` は Nuxt のモジュールで、デッキのフォルダをアプリのページにします。デッキは Astro サイトと同じファイル（`_config.json` と番号付きの `.mdx`・`.md`・`.html`・`.pptx`）をそのまま使えます。

デッキはビルド時に読み込まれます。本番でデッキを変えたときはビルドし直してください。開発中は編集するとページが再読み込みされます。

Nuxt 4 が必要です。

## セットアップ

モジュールを入れます。スライドに ```` ```mermaid ```` の図があるなら `mermaid` も入れてください。

```bash
bun add @astlide/nuxt
bun add mermaid   # 図を使うときだけ
```

Nuxt の設定に追加します。

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@astlide/nuxt"],
  astlide: {
    dir: "decks",
    basePath: "/decks",
  },
  app: {
    head: {
      link: [
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap",
        },
      ],
    },
  },
});
```

モジュールが足すページは 3 つです。デッキの一覧（`/decks/`）、スライド 1 枚ずつ（`/decks/<deck>/<n>`）、印刷ビュー（`/decks/<deck>/all`）で、アプリ側の `<NuxtPage />` で表示されます。アプリに自前の `pages/` フォルダがない場合は、`pages: true` も設定してください。スタイルはモジュールが読み込みます。フォントは上の例のように `<link>` で読み込んでください。

`decks/my-talk/` にデッキを置き、`/decks/my-talk/1` を開けば表示されます。

## オプション

| オプション | 既定値 | 内容 |
|---|---|---|
| `dir` | `"decks"` | デッキのフォルダを並べた場所。プロジェクトのルートからのパスです。 |
| `basePath` | `""` | デッキのページを置く URL のパス。 |
| `toolbar` | 前へ・番号・次へ | ツールバーのボタン。Astro の [`toolbar`](/ja/reference/configuration/) オプションと同じ書き方です。 |
| `shikiTheme` | `"github-dark"` | コードブロックの Shiki テーマ。 |
| `showHidden` | 開発時のみ | `hidden: true` のスライドも表示します。 |
| `mermaid` | `mermaid` が入っていれば有効 | Mermaid の図を描きます。無効にすると図はソースのまま表示され、`mermaid` はバンドルに入りません。 |

`<ImageSide src="/photo.jpg">` のようにスライドで `/` から始まる URL を書くと、アプリの `app.baseURL` が前に付きます。

## スライドの書き方

Astro サイトと同じです。レイアウト、frontmatter、フラグメント、コードのハイライト、数式、Mermaid、スピーカーノートはどれも変わりません。MDX では、Astlide のコンポーネントを import せずに使えます。使えるのは `Columns`・`Left`・`Right`・`ImageSide`・`TextPanel`・`Fragment`・`Fragments`・`SpeakerNotes`（`Notes`）・`CodeBlock`・`Math`・`YouTube`・`Tweet` です。非表示のスライドも Astro と同じ扱いで、番号はそのまま残り、本番では飛ばされます。

プレゼンターウィンドウ、一覧表示、スライド番号へのジャンプ、ペン、レーザーポインター、ノート表示も、同じキーで使えます。

## 書き出し

アプリをビルドしてサーバーを起動し、`astlide export` でそのサイトを指定します。URL には `basePath` まで含めてください。

```bash
bun run build && node .output/server/index.mjs
bunx astlide export my-talk --pdf --pptx --png --base-url http://localhost:3000/decks
```

PPTX は `nuxt dev` からは正しく書き出せません。ビルドしたサーバーを使ってください。

## Astro 版との違い

- テーマは組み込みの 7 つだけです。プラグイン（独自のテーマ・レイアウト・トランジション・デコレーター）と、[PowerPoint テンプレートのテーマ化](/ja/guides/templates/)は、今のところ Astro だけの機能です。
- Astro 版の `font`・`favicon`・`csp`・`slideScripts` にあたるオプションはありません。Markdown・HTML・PowerPoint のスライドに含まれる `<script>` は取り除かれます。
- 開発中のスライド編集（`e` キー）は Astro だけです。
