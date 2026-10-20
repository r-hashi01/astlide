---
title: PowerPoint テンプレート
description: PowerPoint や Google スライドのテンプレートをテーマとして使い、スライドは Markdown で書きます。
---

PowerPoint のテンプレートをテーマとして登録すると、Markdown のスライドがそのテンプレートのデザインで表示されます。テンプレートの背景と装飾、テーマの色とフォント、スライド番号が反映され、各スライドの内容はテンプレートのプレースホルダーの位置に、その文字スタイルで配置されます。

```js
// astro.config.mjs
import astlide from "@astlide/core";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    astlide({
      templates: { brand: "./templates/brand.pptx" },
    }),
  ],
});
```

```json
// src/content/decks/q3-review/_config.json
{ "title": "Q3 review", "theme": "brand" }
```

テンプレートには `.pptx`、`.potx` テンプレート、Office テーマファイル（`.thmx`）を使えます。Google スライドの場合は、ファイル → ダウンロード → Microsoft PowerPoint でテンプレートをダウンロードしてください。`astro dev` の実行中にファイルを編集すると、デッキが再読み込みされます。

## 内容の配置先

スライドの最初の見出しはレイアウトのタイトルプレースホルダーに、それ以外の内容は本文プレースホルダーに入り、テンプレートの文字と同じスタイル（フォント、サイズ、色、配置、内側の余白）で表示されます。

```md
---
slideLayout: default
---

# What we shipped        ← the title placeholder

- Import PowerPoint      ← the body placeholder
- Templates as themes
```

コンテンツのプレースホルダーが 2 つ横に並んだレイアウトでは、`<Left>` と `<Right>` がそれぞれに入り、間隔はテンプレートのものが使われます。レイアウトにスライド番号のプレースホルダーがあれば、そこにスライド番号が表示されます。

## レイアウト

組み込みのレイアウトには、テンプレート側の対応するレイアウトが使われます。

| `slideLayout` | テンプレートのレイアウト |
|---|---|
| `cover` | タイトル スライド |
| `section` | セクション見出し |
| `default` | タイトルとコンテンツ |
| `two-column` | 2 つのコンテンツ |
| `code` | タイトルのみ（なければタイトルとコンテンツ） |

対応するレイアウトは、PowerPoint のレイアウトの種類か、Google スライドから書き出したファイルのように名前（"Title slide"、"Section header" など）で探します。テンプレートのすべてのレイアウトは、名前をスラッグにした値でも指定できます。例: `slideLayout: comparison`、`slideLayout: title-only`、`slideLayout: picture-with-caption` …

その他の組み込みレイアウト（`quote`、`statement`、`image-left` など）は、テンプレートのマスターの背景の上に、それぞれ本来の配置で表示されます。スライドに独自の `background` を指定した場合は、テンプレートの装飾の代わりにその背景が表示されます。

## テーマ変数

テンプレートのテーマからテーマ変数が設定されるので、コンポーネントや独自の CSS もテンプレートに合わせて表示されます。

| 変数 | テンプレート側の値 |
|---|---|
| `--color-background` / `--color-foreground` | 背景 1 / テキスト 1 |
| `--color-primary` / `--color-accent` | アクセント 1 / アクセント 2 |
| `--color-secondary` / `--color-muted` | テキスト 2 / 背景 2 |
| `--font-heading` / `--font-body` | 見出し / 本文のフォント |
| `--font-size-base` / `--font-size-h1` | 「タイトルとコンテンツ」の本文 / タイトルの文字サイズ |

ほかのテーマと同じく、スライドを表示する環境にはテンプレートのフォントをインストールしてください（または、PowerPoint の「ファイルにフォントを埋め込む」でテンプレートにフォントを埋め込んでください）。

## コードから使う

```ts
import { pptxToTemplate, templateCss } from "@astlide/core/pptx";

const template = pptxToTemplate(await readFile("brand.pptx"), {
  media: ({ name, data, type }) => saveSomewhere(name, data, type),
});
template.layouts;   // per layout: name, id, artwork HTML, title / body / slide-number boxes
template.aliases;   // built-in layout → template layout
templateCss(template, "brand"); // the theme's CSS
```

## 制限事項

- スライドは 16:9 です。4:3 のテンプレートは中央に配置され、左右はテンプレートの背景色で埋められます。
- 画像・グラフ・表のプレースホルダーと、日付・フッターのプレースホルダーには何も入りません。
- PPTX に書き出すと、テンプレートの装飾は PowerPoint のマスターとしてではなく図形として描かれます。
