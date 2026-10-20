---
title: コード
description: シンタックスハイライト、行のハイライト、ハイライトのステップ表示。
---

コードフェンスは [Shiki](https://shiki.style) でハイライトされます（デフォルトのテーマは `github-dark` です。[`shikiTheme`](/ja/reference/configuration/) オプションで変更できます）。

## 行のハイライト

言語名の後ろに `{…}` で範囲を書くと、その行がハイライトされ、残りの行は薄く表示されます。

````md
```ts {2,4-6}
// highlights line 2 and lines 4–6
```
````

## ハイライトのステップ表示

範囲を `|` で区切ると、[フラグメント](/ja/guides/fragments/)と同じように `→` / `Space` で順に切り替えられます。`all` または `*` はすべての行をハイライトします。

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

- 最初の範囲が初期状態で、以降の範囲がそれぞれ 1 ステップになります。
- ステップはフラグメントと合わせて文書順に進みます（コードのステップはインデックス `0` として数えます）。
- `.mdx` と `.md` のスライドで使えます。`<CodeBlock>` の中でも動作します。
- PDF エクスポートでは最後のステップが表示されます。

薄く表示する度合いは CSS 変数 `--code-dim-opacity`（デフォルト `0.35`）で調整できます。

## ファイル名ヘッダーとコピーボタン

コードフェンスを [`<CodeBlock title="…">`](/ja/guides/layouts-and-components/#codeblock) で囲みます。

## トランスフォーマーをほかで使う

この機能を実現している Shiki のトランスフォーマーはエクスポートされているので、独自の Shiki 設定でも使えます。

```ts
import { astlideCodeHighlight } from "@astlide/core/utils/code-highlight";
```
