---
title: テーマとプラグイン
description: 組み込みテーマ、独自テーマの作り方、プラグイン API、スライドデコレーター、デッキのメタデータ、フォントの設定を説明します。
---

## テーマ

組み込みのテーマは `default`、`dark`、`minimal`、`corporate`、`gradient`、`rose`、`forest` の 7 種類です。デッキごとに `_config.json` で選びます。

```json
{ "theme": "gradient" }
```

### カスタムテーマ

テーマの実体は CSS です。`[data-theme="<name>"]` のセレクターの中で、Astlide のカスタムプロパティに値を設定します。

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

作ったテーマは後述のプラグインで登録します。あとはデッキの `_config.json` で `"theme": "my-theme"` を指定すれば使えます。

### PowerPoint テンプレートから作る

`.pptx` / `.potx` / `.thmx` のテンプレートもテーマとして使えます。`astlide({ templates: { brand: './brand.pptx' } })` のように登録すると、テンプレートの背景、フォント、色、プレースホルダーの位置がスライドに反映されます。詳しくは [PowerPoint テンプレート](/ja/guides/templates/)を参照してください。

## プラグイン API

プラグインを使うと、テーマ、レイアウト、トランジション、Shiki の言語とテーマ、スライドデコレーターを追加できます。

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

`cssEntrypoint` は、Vite が import と同じ方法で解決します。最終的に CSS ファイルを指していれば、相対パスでも npm パッケージ名でもかまいません。

レイアウトは**名前**だけでも登録できます。その場合、スライドに `.slide-<name>` クラスが付くので、プラグインの CSS でそのクラスにスタイルを当てます。`componentEntrypoint` を指定すると、スライドのマークアップをプラグインの `.astro` コンポーネントで組めます。

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

ロゴ、フッター、ページ番号、戻るリンクのようなコンポーネントを、**すべての**スライドに表示できます。スライドのファイルを 1 つずつ編集する必要はありません。

```js
astlide({ slideDecorators: ["./src/components/DeckFooter.astro"] });
```

プラグインからもデコレーターを追加できます（`decorators: [{ componentEntrypoint: "…" }]`）。

## デッキとスライドのメタデータ

デッキ名、スライド番号、スライドの総数、レイアウト、トランジション、読み込んだ設定の内容を取得できます。

```astro
---
// server-side, inside any slide component or decorator
import { getDeckContext } from "@astlide/core/context";
const ctx = getDeckContext(Astro);
---
<footer>{ctx?.config.title} — {ctx?.slideNumber}/{ctx?.totalSlides}</footer>
```

ブラウザ側では `getClientDeckContext()` を使います。返ってくるオブジェクトの形は同じです。

## フォント

Astlide は標準で Google Fonts から Inter（本文用）と JetBrains Mono（コード用）を読み込みます。そのため、スライドも書き出した PDF も、どのマシンで見ても同じフォントになります。

```js
astlide({ font: false }); // use whatever your CSS specifies
astlide({ font: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans&display=swap" });
```

### 日本語フォント

Inter には日本語の文字が入っていません。そのため日本語はブラウザや OS の代替フォントで表示され、環境によって見た目が変わります。日本語のスライドでは、`font` オプションで日本語の Web フォントも読み込み、独自テーマの `--font-body` / `--font-heading` に指定しておくことをおすすめします。

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

PPTX に書き出すときの日本語フォントの扱いは、[エクスポート](/ja/guides/export/#日本語のフォント)を参照してください。

## トップページを自分で作る

Astlide は標準で `/` にデッキの一覧を表示します。自分で `src/pages/index.{astro,md,mdx,html}` を置くと、Astlide がそれを見つけて、一覧のルートを登録しなくなります。この判定に任せず、`injectIndexRoute: false | true` で明示的に切り替えることもできます。
