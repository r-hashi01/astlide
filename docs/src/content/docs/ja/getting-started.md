---
title: はじめに
description: Astlide のプロジェクトを新しく作るか、既存の Astro サイトに Astlide を追加します。
---

Astlide は [Astro](https://astro.build) のインテグレーションです。**Astro 7.2.10 以降**が必要です。開発には [Bun](https://bun.sh) を使っています。

## 新しいプロジェクトを作る

```bash
bun create astlide my-slides
cd my-slides
bun install
bun run dev
```

開発サーバーの URL を開くと、デッキの一覧が出ます。デッキを選べば、そのまま発表を始められます。

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

`decks` コンテンツコレクションを定義します。ローダーとスキーマには Astlide のものを使います。

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
`glob({ pattern: "**/*.mdx" })` ではなく `astlideDeckLoader()` を使ってください。`.md` や `.html` のスライドも読み込み、番号順に並べます。
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

`src/content/decks/` の下のフォルダー 1 つが、1 つのデッキになります。各スライドは `/<deck>/<slide-number>` で開けます。デッキの一覧は `/` にあります。

## 次のステップ

- [チュートリアル](/ja/tutorial/first-deck/)に沿って、発表資料を作り、発表し、公開するまでを一通り試す
- [最初のデッキを作る](/ja/guides/decks/)
- [発表する](/ja/guides/presenting/) — キーボードショートカット、発表者ウィンドウ、ペンとレーザーポインター
- すべてのレイアウトとテーマを[ギャラリー](/ja/gallery/)で見る（[ライブデモ](https://astlide.dev/demo/tour/1/)もあります）
