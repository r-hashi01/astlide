---
title: はじめに
description: Astlide のプロジェクトを新しく作る手順と、既存の Astro サイトに Astlide を追加する手順です。
---

Astlide は [Astro](https://astro.build) のインテグレーションです。動かすには **Astro 7.2.10 以降**と Node.js 22.12 以降が必要です。このページのコマンドは [Bun](https://bun.sh) で書いていますが、npm、pnpm、Yarn でもかまいません。

## 新しいプロジェクトを作る

```bash
bun create astlide my-slides
cd my-slides
bun install
bun run dev
```

`bun create astlide` を実行すると、テーマ、サンプルのスライドを入れるかどうか、使うパッケージマネージャーの 3 つを聞かれます。迷ったら Enter で既定値のまま進めてください。このコマンドはパッケージをインストールしないので、続けて `bun install` を実行します。

開発サーバーが起動したら `http://localhost:4321` を開きます。デッキの一覧に `example-deck` が 1 つ表示されるので、クリックすると 1 枚目のスライドが開きます。

:::note
生成された `src/content.config.ts` が読み込むのは `.mdx` のスライドだけです。`.md`、`.html`、`.pptx` のスライドも使う場合は、次の節にある `astlideDeckLoader()` を使った内容に書き換えてください。
:::

## 既存の Astro プロジェクトに追加する

パッケージをインストールします。

```bash
bun add @astlide/core
```

Astro の設定ファイルにインテグレーションを追加します。

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import astlide from "@astlide/core";

export default defineConfig({
  integrations: [astlide()],
});
```

最後に `decks` という名前のコンテンツコレクションを定義します。ローダーとスキーマは Astlide が提供するものを指定します。

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
ローダーには `astlideDeckLoader()` を使ってください。`glob({ pattern: "**/*.mdx" })` では `.mdx` のファイルしか見つかりません。`astlideDeckLoader()` なら `.md`、`.html`、`.pptx` のスライドも読み込み、ファイル名の番号順に並べます。
:::

サイトにトップページ（`src/pages/index.astro` や `.md`、`.mdx`、`.html`）がすでにある場合、Astlide は `/` をそのページに任せ、デッキの一覧を追加しません。その場合も、各デッキは `/<deck>/1` で開けます。

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

`src/content/decks/` の下にあるフォルダーが、それぞれ 1 つのデッキです。フォルダー名は URL に使われ、`my-talk` の 2 枚目は `/my-talk/2` で開けます。スライドの順番は、ファイル名の先頭の番号で決まります。`_config.json` には、デッキのタイトル、作成者、日付、テーマを書きます。`/` を開くと、すべてのデッキが一覧で表示されます。

## 次に読むページ

- [チュートリアル](/ja/tutorial/first-deck/)で、短い発表資料を作ってから発表し、PDF に書き出して公開するまでを試せます。
- スライドに何を書けるかは[デッキを作成する](/ja/guides/decks/)で説明しています。
- キー操作と発表者ウィンドウの使い方は[プレゼンテーション](/ja/guides/presenting/)にまとめています。
- レイアウトとテーマの見本は[ギャラリー](/ja/gallery/)にあります。[ライブデモ](https://astlide.dev/demo/tour/1/)でも実際に操作できます。
