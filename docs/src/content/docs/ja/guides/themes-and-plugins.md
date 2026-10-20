---
title: テーマとプラグイン
description: 組み込みテーマ、カスタムテーマ、プラグイン API、スライドデコレーター、デッキのメタデータ、フォント。
---

## テーマ

組み込みテーマは `default`、`dark`、`minimal`、`corporate`、`gradient`、`rose`、`forest` です。デッキごとに `_config.json` で指定します。

```json
{ "theme": "gradient" }
```

### カスタムテーマ

テーマは、`[data-theme="<name>"]` にスコープした CSS で Astlide のカスタムプロパティを設定したものです。

```css
/* themes/my-theme.css */
[data-theme="my-theme"] {
  --color-background: #fef3c7;
  --color-foreground: #78350f;
  --color-primary: #d97706;
  --color-secondary: #92400e;
  --color-accent: #fbbf24;
  --color-muted: #fde68a;
  --code-background: #451a03;
}
```

後述のプラグインで登録し、デッキの `_config.json` で `"theme": "my-theme"` を指定します。

### PowerPoint テンプレートから作る

`.pptx` / `.potx` / `.thmx` のテンプレートもテーマとして使えます。`astlide({ templates: { brand: './brand.pptx' } })` のように登録すると、テンプレートの背景、フォント、色、プレースホルダーの位置が反映されます。詳しくは [PowerPoint テンプレート](/ja/guides/templates/)を参照してください。

## プラグイン API

プラグインでは、テーマ、レイアウト、トランジション、Shiki の言語 / テーマ、スライドデコレーターを追加できます。

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import astlide from "@astlide/core";
import { defineAstlidePlugin } from "@astlide/core/plugin";

const myPlugin = defineAstlidePlugin({
  name: "astlide-plugin-midnight",
  themes: [{ name: "midnight", cssEntrypoint: "./themes/midnight.css" }],
  layouts: [{ name: "split-quote" }],
  transitions: [{ name: "iris" }],
  shiki: {
    langs: [/* additional Shiki langs */],
    themes: [{ name: "neon-night" /* shiki theme JSON */ }],
  },
});

export default defineConfig({
  integrations: [astlide({ plugins: [myPlugin] })],
});
```

`cssEntrypoint` は Vite の import として解決されます。CSS に解決されるモジュール指定子であれば、相対パスでも npm パッケージでも使えます。

レイアウトは**名前**だけを登録することもできます（スライドに `.slide-<name>` クラスが付くので、プラグインの CSS から対象にできます）。`componentEntrypoint` を指定すれば、プラグインの `.astro` コンポーネントがスライドのマークアップを担当します。

```js
layouts: [
  { name: "split-quote", componentEntrypoint: "astlide-plugin-acme/SplitQuote.astro" },
],
```

### プラグインを公開する

| フィールド | 値 |
|---|---|
| パッケージ名 | `astlide-plugin-*` または `@scope/astlide-plugin-*` |
| `keywords` | `"astlide-plugin"` を含める |
| `peerDependencies` | `{ "@astlide/core": "^x.y" }` |
| デフォルトエクスポート | `defineAstlidePlugin({ … })` |

## スライドデコレーター

ロゴ、フッター、ページ番号、戻るリンクなどのコンポーネントを、各ファイルを編集せずに**すべての**スライドに描画します。

```js
astlide({ slideDecorators: ["./src/components/DeckFooter.astro"] });
```

プラグインからもデコレーターを追加できます（`decorators: [{ componentEntrypoint: "…" }]`）。

## デッキとスライドのメタデータ

デッキ名、スライド番号、総数、レイアウト、トランジション、パース済みの設定を取得できます。

```astro
---
// server-side, inside any slide component or decorator
import { getDeckContext } from "@astlide/core/context";
const ctx = getDeckContext(Astro);
---
<footer>{ctx?.config.title} — {ctx?.slideNumber}/{ctx?.totalSlides}</footer>
```

ブラウザでは、`getClientDeckContext()` が同じ形のオブジェクトを返します。

## フォント

Astlide はデフォルトで Google Fonts から Inter（本文）と JetBrains Mono（コード）を読み込むので、スライドや書き出した PDF はどのマシンでも同じフォントで表示されます。

```js
astlide({ font: false }); // use whatever your CSS specifies
astlide({ font: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans&display=swap" });
```

### 日本語フォント

Inter には日本語のグリフが含まれていないため、日本語の文字はブラウザや OS のフォールバックフォントで表示され、環境によって見た目が変わります。日本語のスライドでは、`font` オプションで日本語の Web フォントも読み込み、カスタムテーマの `--font-body` / `--font-heading` に指定しておくのがおすすめです。

```js
astlide({
  font: "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Noto+Sans+JP:wght@400;700&family=JetBrains+Mono&display=swap",
});
```

```css
[data-theme="my-theme"] {
  --font-body: "Inter", "Noto Sans JP", sans-serif;
  --font-heading: "Inter", "Noto Sans JP", sans-serif;
}
```

PPTX エクスポートでの日本語フォントの扱いは、[エクスポート](/ja/guides/export/#日本語のフォント)を参照してください。

## カスタムのホームページ

Astlide は `/` でデッキの一覧を配信します。独自の `src/pages/index.{astro,md,mdx,html}` を追加すると、Astlide はそれを検出して一覧のルートを登録しません。`injectIndexRoute: false | true` でどちらかに固定することもできます。
