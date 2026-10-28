---
title: コード
description: コードのシンタックスハイライトと、特定の行の強調、強調する行を段階的に切り替える方法を説明します。
---

スライドに書いたコードフェンスは、[Shiki](https://shiki.style) でシンタックスハイライトします。デフォルトのテーマは `github-dark` です。別のテーマにするには、[`shikiTheme`](/ja/reference/configuration/) オプションを設定します。

## 行のハイライト

特定の行に注目させたいときは、言語名のあとに `{}` で行番号を書きます。指定した行が強調され、それ以外の行は薄く表示されます。

````md
```ts {2,4-6}
// highlights line 2 and lines 4–6
```
````

行番号はカンマで区切ります。連続した行は `4-6` のように範囲で書けます。

## ハイライトのステップ表示

コードを順に説明したいときは、複数の範囲を `|` で区切ります。最初は 1 つ目の範囲が強調された状態で表示され、`→` か `Space` を押すたびに次の範囲へ進みます。進み方は[段階表示](/ja/guides/fragments/)と同じです。`all` か `*` と書くと、すべての行を強調します。

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

この例では、まず 1 行目を強調した状態でスライドが表示されます。そこから 3〜6 行目、8 行目と進み、最後にコード全体を強調します。

- コードのステップと段階表示は、スライドの中で 1 つの順番にまとめて進みます。コードのステップは `index` なしの扱いです。`index` のない段階表示と一緒に文書の順に進み、`index` を指定した段階表示はそのあとに来ます。詳しくは[ステップの順番](/ja/guides/fragments/#ステップの順番)を参照してください。
- `.mdx` と `.md` のスライドで使えます。`<CodeBlock>` の中でも使えます。
- エクスポート（PDF、PNG、PPTX）と `/<deck>/all` の一覧ページでは、最後のステップの状態で表示します。

薄く表示する行の濃さは、CSS 変数 `--code-dim-opacity` で変えられます。デフォルトは `0.35` です。

## ファイル名の表示とコピーボタン

コードの上にファイル名を表示し、コピーボタンを付けるには、コードフェンスを [`<CodeBlock title="…">`](/ja/guides/layouts-and-components/#codeblock) で囲みます。

## 自分の Shiki 環境でトランスフォーマーを使う

行のハイライトとステップは、Astlide が自動で登録する Shiki のトランスフォーマーで実現しています。Shiki を自分で使ってコードを描画している場合は、このトランスフォーマーをインポートして組み込めます。

```ts
import { astlideCodeHighlight } from "@astlide/core/utils/code-highlight";
```

トランスフォーマーが行うのは、HTML にクラスと data 属性を付けることだけです。行を薄くする表示やステップの切り替えは、Astlide のスライド用スタイルとデッキの実行時スクリプトが担当します。デッキの外で使う場合は、`highlighted` クラスの付いた行のスタイルを自分で用意してください。
