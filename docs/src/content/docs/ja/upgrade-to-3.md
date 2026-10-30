---
title: Astlide 3 への移行
description: Astlide 3 で Astro プロジェクトについて変わる点と、移行の手順です。デッキ自体は変わりません。
---

Astro プロジェクトは、パッケージ名と一部の import を書き換えれば Astlide 3 に移行できます。Astro のインテグレーションが `@astlide/core` から `@astlide/astro` に移ったためです。スライド、frontmatter、`_config.json`、テーマ、レイアウト、コンポーネントはそのまま使えるので、デッキには手を入れなくてかまいません。

## Astro プロジェクトの移行手順

1. パッケージを入れ替えます。`@astlide/astro` を入れると、`@astlide/core` と `astlide` コマンドも一緒に入ります。

   ```bash
   bun remove @astlide/core
   bun add @astlide/astro
   ```

2. インテグレーションを `@astlide/astro` から読み込みます。

   ```js
   // astro.config.mjs
   import astlide from "@astlide/astro"; // 以前は "@astlide/core"
   ```

3. ローダーとスキーマも `@astlide/astro` から読み込みます。

   ```ts
   // src/content.config.ts
   import { astlideDeckLoader, slideSchema } from "@astlide/astro"; // 以前は "@astlide/core"
   ```

4. Astlide のコンポーネントなどを直接 import している場合は、次の表のとおりにパスを書き換えます。

   | Astlide 2 | Astlide 3 |
   |---|---|
   | `@astlide/core`（インテグレーション、`astlideDeckLoader`） | `@astlide/astro` |
   | `@astlide/core/loader` | `@astlide/astro/loader` |
   | `@astlide/core/components/*.astro` | `@astlide/astro/components/*.astro` |
   | `@astlide/core/internal/diagrams` | `@astlide/core/runtime/diagrams` |
   | `@astlide/core/internal/recording` | `@astlide/core/runtime/media` |
   | `@astlide/core/internal/pdf-export` | `@astlide/core/runtime/pdf-export` |
   | 末尾が `.ts` のパス（`@astlide/core/utils/network.ts` など） | `.ts` を取ったパス |

   これ以外の `@astlide/core/internal/*` と、`utils/csp`・`utils/favicon`・`utils/pptx-templates`・`utils/slide-mark` は import できなくなります。どれもドキュメントに載せていない内部用のモジュールです。これらを使っている場合は [issue](https://github.com/r-hashi01/astlide/issues) で用途を教えてください。

次のものは今までと同じ場所にあります：`@astlide/core/schema`・`/plugin`・`/context`・`/embed`・`/pptx`・`/templates`・`/mcp`・`/styles/*`、ドキュメントで案内している `utils/base-path`・`utils/code-highlight`・`utils/mermaid`。`@astlide/core` 自体からも、スキーマ、`defineAstlidePlugin`、`getDeckContext` / `getClientDeckContext` を引き続き import できます。

## プラグイン

プラグインは今までどおり `@astlide/core/plugin` から `defineAstlidePlugin` を import します。peer dependency は `@astlide/core` の 3 に上げてください。レイアウトを `.astro` のコンポーネントで提供しているなら、`@astlide/astro` の 3 にします。

## 3 で使えるようになること

- **[Next.js](/ja/frameworks/next/)・[Nuxt](/ja/frameworks/nuxt/)・[React](/ja/frameworks/react/)・[Vue](/ja/frameworks/vue/) でも同じデッキを使えます。** MDX のスライドも、プレゼンターウィンドウや書き出しもそのままです。
- **Astro プロジェクトの外でも `astlide export --base-url` を使えます。** 起動中の Astlide サイトなら、どのフレームワークで作ったものでも PDF・PNG・PPTX を書き出せます。
- **まだ専用パッケージのないフレームワークにもデッキを載せられます。** `@astlide/core/deck`・`/deck/pages`・`/deck/print-view`・`/render`・`/runtime` が、各フレームワーク用パッケージの材料です。
