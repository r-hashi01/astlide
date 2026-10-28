---
title: コード
description: シンタックスハイライト、行のハイライト、ハイライトのステップ表示。
---

コードフェンスは [Shiki](https://shiki.style) でハイライトします。デフォルトのテーマは `github-dark` で、[`shikiTheme`](/ja/reference/configuration/) オプションで変更できます。

## 行のハイライト

言語名の後ろに `{…}` で行の範囲を書くと、その行をハイライトし、ほかの行を薄く表示します。

````md
```ts {2,4-6}
// highlights line 2 and lines 4–6
```
````

## ハイライトのステップ表示

範囲を `|` で区切ると、[段階表示](/ja/guides/fragments/)と同じように `→` / `Space` で 1 つずつ切り替えられます。`all` か `*` を書くと、すべての行をハイライトします。

````md
```ts {1|3-6|8|all}
import { defineCollection } from "astro:content";

const decks = defineCollection({
  loader: astlideDeckLoader(),
  schema: slideSchema,
});

export const collections = { decks };
```
````

- 最初の範囲が初期状態です。2 つ目以降の範囲が 1 ステップずつになります。
- 段階表示のステップと混ざって、文書に書いた順に進みます（コードのステップは index `0` として数えます）。
- `.mdx` と `.md` のスライドで使えます。`<CodeBlock>` の中でも使えます。
- PDF エクスポートでは最後のステップの状態になります。

薄く表示する度合いは、CSS 変数 `--code-dim-opacity`（デフォルト `0.35`）で調整できます。

## ファイル名のヘッダーとコピーボタン

コードフェンスを [`<CodeBlock title="…">`](/ja/guides/layouts-and-components/#codeblock) で囲みます。

## トランスフォーマーを単体で使う

この機能は Shiki のトランスフォーマーで実装しています。トランスフォーマーはエクスポートしてあるので、自分の Shiki の設定にも組み込めます。

```ts
import { astlideCodeHighlight } from "@astlide/core/utils/code-highlight";
```
