---
title: 設定
description: astlide() インテグレーションのオプションと、デッキの _config.json。
---

## インテグレーションのオプション

```js
// astro.config.mjs
import astlide from "@astlide/core";

export default defineConfig({
  integrations: [
    astlide({
      toolbar: ["prev", "counter", "next"],
      slideDecorators: [],
      plugins: [],
      shikiTheme: "github-dark",
      font: undefined,
      csp: true,
      indexable: false,
      injectIndexRoute: undefined,
      drawings: { persist: false },
      notes: "dev",
    }),
  ],
});
```

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `toolbar` | `ToolbarItem[]` | `["prev", "counter", "next"]` | ツールバーのアクションを並べたリスト。[プレゼンテーション](/ja/guides/presenting/#ツールバー)を参照してください。 |
| `slideDecorators` | `string[]` | `[]` | すべてのスライドに描画するコンポーネント（モジュール指定子）。 |
| `plugins` | `AstlidePlugin[]` | `[]` | テーマ、レイアウト、トランジション、Shiki の言語 / テーマ、デコレーター。[プラグイン API](/ja/guides/themes-and-plugins/#プラグイン-api) を参照してください。 |
| `shikiTheme` | `string` | `"github-dark"` | コードフェンスに使う Shiki のテーマ。 |
| `font` | `false \| string \| { href?, preconnect? }` | Google Fonts の Inter + JetBrains Mono | 読み込む Web フォントのスタイルシート。`false` で読み込みません。 |
| `favicon` | `string \| false` | 自動 | デッキのページと一覧ページのファビコン。デフォルトでは `public/` に `favicon.svg` / `.ico` / `.png` があればそれを使い、なければ空のアイコンを使います（ドメイン直下の `/favicon.ico` へのリクエストは発生しません）。ルート相対パスには Astro の `base` が付きます。`false` でアイコンのリンクを出力しません。 |
| `csp` | `boolean \| string` | `true` | デフォルトの Content-Security-Policy の meta タグ（スライドのページ、`/[deck]/all`、一覧ページに入り、`base-uri 'self'; form-action 'self'; object-src 'none'` を含みます）を挿入するか、無効にするか、独自のポリシーを指定します。`astro dev` では、Vite のクライアント用に `worker-src 'self' blob:` が（指定がなければ）追加されます。ビルドではポリシーはそのままです。 |
| `indexable` | `boolean` | `false` | `false` の場合、ページに `noindex, nofollow` が付きます。 |
| `injectIndexRoute` | `boolean` | 自動 | `/` にデッキの一覧を挿入します。独自の `src/pages/index.*` がある場合は自動的にスキップされます。 |
| `drawings.persist` | `boolean` | `false` | ペンの描画を `localStorage` に保存し、再読み込み後も残します。[プレゼンテーション](/ja/guides/presenting/#描画を残す)を参照してください。 |
| `notes` | `"public" \| "dev"` | `"dev"` | スピーカーノートをどこに含めるか。`"dev"` は `astro dev` のときと、`astlide export` が行うビルドにだけ含めます（PowerPoint の書き出しにはノートが入ります）。`astro build` でビルドしたページには含めません。`"public"` はすべてのページに含めるので、URL を知っている人なら誰でも読めます。[スピーカーノート](/ja/guides/decks/#スピーカーノート)を参照してください。 |

Astro 自体の [`base`](/ja/guides/deploy/) オプションにも従います。

## デッキの `_config.json`

| フィールド | 型 | デフォルト | 説明 |
|---|---|---|---|
| `title` | `string` | フォルダ名 | デッキ一覧とブラウザのタブに表示されます。 |
| `author` | `string` | — | デッキ一覧に表示されます。 |
| `date` | `string` | — | デッキ一覧に表示される ISO 形式の日付。 |
| `theme` | `string` | `"default"` | 組み込みテーマまたはプラグインのテーマの名前。 |

## パッケージのエントリーポイント

| import | 内容 |
|---|---|
| `@astlide/core` | インテグレーション（デフォルトエクスポート）、`astlideDeckLoader`、`slideSchema`、`deckConfigSchema`、`THEMES`、`defineAstlidePlugin`、コンテキストのヘルパー |
| `@astlide/core/plugin` | `defineAstlidePlugin` とプラグインの型 |
| `@astlide/core/context` | `getDeckContext`、`getClientDeckContext` |
| `@astlide/core/utils/code-highlight` | Shiki トランスフォーマー `astlideCodeHighlight` |
| `@astlide/core/utils/mermaid` | Shiki トランスフォーマー `astlideMermaid` |

API の詳細: [TypeDoc リファレンス](https://astlide.dev/api/)
