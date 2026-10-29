---
title: テーマとプラグイン
description: 組み込みテーマの選び方と独自テーマの作り方、プラグインによる拡張、全スライド共通の要素の追加、スライドのメタデータの取得、フォントの設定を説明します。
---

## テーマ

組み込みのテーマは `default`、`dark`、`minimal`、`corporate`、`gradient`、`rose`、`forest` の 7 種類です。デッキごとに `_config.json` で指定します。

```json
{ "theme": "gradient" }
```

各テーマの見た目は[ギャラリー](/ja/gallery/#テーマ)で比べられます。

### カスタムテーマ

テーマは CSS ファイル 1 つで作れます。`[data-theme="<name>"]` のセレクターの中で、Astlide のカスタムプロパティに値を設定してください。設定しなかったプロパティには `default` テーマの値が使われます。

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

作ったテーマを使う手順は次のとおりです。

1. プラグインの `themes` に CSS ファイルを登録します。書き方は[プラグイン API](#プラグイン-api) の例を参照してください。
2. デッキの `_config.json` で `"theme": "my-theme"` を指定します。

### PowerPoint テンプレートをテーマにする

`.pptx`、`.potx`、`.thmx` のファイルもテーマとして使えます。`astlide({ templates: { brand: './brand.pptx' } })` のように登録すると、テンプレートの背景、フォント、色、プレースホルダーの位置がスライドに反映されます。詳しくは [PowerPoint テンプレート](/ja/guides/templates/)を参照してください。

## プラグイン API

プラグインで追加できるのは、テーマ、レイアウト、トランジション、Shiki の言語とテーマ、スライドデコレーターです。`defineAstlidePlugin` で定義し、`astlide({ plugins })` に渡します。

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import astlide from "@astlide/astro";
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

`cssEntrypoint` のファイルは Vite から読み込まれます。プロジェクト内のファイルは `./` から始まるパスで書きます。パスはプロジェクトのルートを起点に解決されます。`astlide-plugin-midnight/midnight.css` のように、パッケージ内のファイルも指定できます。

レイアウトは名前だけでも登録できます。そのレイアウトを使ったスライドには `.slide-<name>` クラスが付くので、プラグインの CSS でこのクラスにスタイルを当てます。スライドのマークアップ自体を変えたい場合は、`componentEntrypoint` に `.astro` コンポーネントを指定します。

```js
layouts: [
  { name: "split-quote", componentEntrypoint: "astlide-plugin-acme/SplitQuote.astro" },
],
```

テーマ、レイアウト、トランジションの名前が複数のプラグインで重なった場合は、先に登録されたものが使われます。組み込みの名前はどのプラグインよりも先に登録されます。そのため、組み込みテーマをプラグインで上書きしても反映されません。

### プラグインを公開する

npm に公開するときは、次のように設定します。

| フィールド | 値 |
|---|---|
| パッケージ名 | `astlide-plugin-*` または `@scope/astlide-plugin-*` |
| `keywords` | `"astlide-plugin"` を含める |
| `peerDependencies` | `{ "@astlide/core": "^x.y" }` |
| デフォルトエクスポート | `defineAstlidePlugin({ … })` |

## スライドデコレーター

デコレーターは、すべてのスライドに表示するコンポーネントです。スライドの内容の後に描画されます。ロゴ、フッター、ページ番号、一覧に戻るリンクなどを、スライドのファイルを 1 つずつ編集せずに追加できます。

```js
astlide({ slideDecorators: ["./src/components/DeckFooter.astro"] });
```

`./` から始まるパスは、プロジェクトのルートを起点に解決されます。表示位置は CSS で調整してください。`.slide` には `position: relative` が設定されています。プラグインからも `decorators: [{ componentEntrypoint: "…" }]` でデコレーターを追加できます。

## デッキとスライドのメタデータ

スライド内のコンポーネントやデコレーターでは、`getDeckContext(Astro)` でデッキ名、スライド番号、スライドの総数、レイアウト、トランジション、デッキの `_config.json` の内容を取得できます。

```astro
---
// server-side, inside any slide component or decorator
import { getDeckContext } from "@astlide/core/context";
const ctx = getDeckContext(Astro);
---
<footer>{ctx?.config.title} — {ctx?.slideNumber}/{ctx?.totalSlides}</footer>
```

スライドの外で呼ぶと `undefined` が返ります。ブラウザで動くスクリプトからは `getClientDeckContext()` を使います。取得できる項目は同じです。

## フォント

Astlide は標準で、Google Fonts から本文用の Inter とコード用の JetBrains Mono を読み込みます。こうしておくと、スライドも書き出した PDF も、どのマシンでも同じ見た目になります。変更するには `font` オプションを指定します。

```js
astlide({ font: false }); // use whatever your CSS specifies
astlide({ font: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans&display=swap" });
```

URL を指定すると、標準のスタイルシートの代わりにその URL を読み込みます。Inter や JetBrains Mono も使い続けたい場合は、URL に含めてください。

### 日本語フォント

Inter には日本語の文字が含まれていません。そのため日本語の部分はブラウザや OS が選んだフォントで表示され、見た目が環境ごとに変わります。日本語のスライドでは、`font` で日本語の Web フォントも読み込み、テーマの `--font-body` と `--font-heading` に指定してください。

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

PPTX に書き出したときの日本語フォントの扱いは、[エクスポート](/ja/guides/export/#日本語のフォント)を参照してください。

## トップページを自分で作る

Astlide は `/` にデッキの一覧ページを置きます。プロジェクトに `src/pages/index.{astro,md,mdx,html}` があれば、そちらがトップページになり、一覧ページは追加されません。この動作を自分で決めたい場合は `injectIndexRoute` を指定します。`false` なら一覧ページを追加せず、`true` なら常に追加します。
