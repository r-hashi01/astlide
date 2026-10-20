---
title: はじめに
description: Astlide の新しいプロジェクトを作成するか、既存の Astro サイトに Astlide を追加します。
---

Astlide は [Astro](https://astro.build) のインテグレーションです。**Astro 7.2.10 以降**が必要です。このドキュメントのコマンドは [Bun](https://bun.sh) で書いています。

## 新しいプロジェクトを作成する

```bash
bun create astlide my-slides
cd my-slides
bun install
bun run dev
```

開発サーバーの URL を開くとデッキの一覧が表示され、デッキを選ぶとそのまま発表を始められます。

## 既存の Astro プロジェクトに追加する

```bash
bun add @astlide/core
```

インテグレーションを登録します。

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import astlide from "@astlide/core";

export default defineConfig({
  integrations: [astlide()],
});
```

Astlide のローダーとスキーマを使って、`decks` コンテンツコレクションを定義します。

```ts
// src/content.config.ts
import { defineCollection } from "astro:content";
import { astlideDeckLoader, slideSchema } from "@astlide/core";

const decks = defineCollection({
  // Renders .mdx, .md, and .html slides from src/content/decks/<deck>/
  loader: astlideDeckLoader(),
  schema: slideSchema,
});

export const collections = { decks };
```

:::caution
`glob({ pattern: "**/*.mdx" })` ではなく `astlideDeckLoader()` を使ってください。`.md` や `.html` のスライドも扱え、番号順の並びも保たれます。
:::

## プロジェクト構成

```
src/
├── content.config.ts
└── content/
    └── decks/
        └── my-talk/
            ├── _config.json      # title, author, date, theme
            ├── 01-cover.mdx
            ├── 02-intro.md
            └── 03-demo.html
```

`src/content/decks/` の下にあるフォルダが 1 つずつデッキになり、`/<deck>/<slide-number>` で配信されます。デッキの一覧は `/` にあります。

## 次のステップ

- [チュートリアル](/ja/tutorial/first-deck/)に沿って、発表の作成・プレゼン・公開までを体験する
- [最初のデッキを作る](/ja/guides/decks/)
- [プレゼンする](/ja/guides/presenting/) — キーボードショートカット、発表者ウィンドウ、ペンとレーザーポインター
- すべてのレイアウトとテーマを[ギャラリー](/ja/gallery/)で見る、または[ライブデモを試す](https://astlide.dev/demo/tour/1/)
