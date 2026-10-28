---
title: React・Vue・Svelte のコンポーネント
description: React、Vue、Svelte、Solid、Preact のコンポーネントをスライドで使う方法です。ブラウザでは操作でき、PDF と PPTX には最初の状態で出力されます。
---

Astlide は Astro のインテグレーションなので、Astro が対応しているフレームワーク（React、Vue、Svelte、Solid、Preact）のコンポーネントをスライドで使えます。手元にあるグラフやデモ用のウィジェット、デザインシステムのコンポーネントを、スライド用に書き直す必要はありません。

## セットアップ

Astlide に加えて、使うフレームワークの Astro インテグレーションを追加します。

```bash
bunx astro add react    # or: vue, svelte, solid-js, preact
```

```js
// astro.config.mjs
import astlide from "@astlide/core";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [react(), astlide()],
});
```

## スライドでコンポーネントを使う

`.mdx` スライドの先頭でインポートすれば、ほかの要素と同じように書けます。

```mdx
---
title: Live demo
---
import Counter from "../../../components/Counter.tsx";
import PriceChart from "../../../components/PriceChart.vue";

# Live demo

<PriceChart quarter="Q3" />

<Counter label="Clicks" client:load />
```

`client:*` ディレクティブを付けなければ、コンポーネントはビルド時に HTML になり、JavaScript はブラウザに送られません。操作に反応しなくてよいグラフや図なら、これで足ります。発表中に操作したいコンポーネントには、[`client:load`](https://docs.astro.build/ja/reference/directives-reference/#client-directives)（または `client:visible`、`client:idle`）を付けてください。

1 枚のスライドに、別々のフレームワークのコンポーネントを並べてもかまいません。

## PDF と PPTX での表示

エクスポートすると、コンポーネントは**最初に描画された状態**で出力されます。

- **PDF / PNG**（ブラウザで描画）: スライドを読み込み、`client:*` のコンポーネントが動き出したあとの表示になります。
- **PPTX**（ブラウザを使わずにレイアウト）: サーバーで描画した HTML を使います。テキスト、ボックス、SVG は、スライドのほかの部分と同じく編集できる図形になります。

ブラウザだけで描画するコンポーネント（`client:only`）には、ビルド時の HTML がありません。そのため PPTX には出力されません。サーバーで描画できる状態を用意するか、[静的な代替表示](/ja/guides/layouts-and-components/#埋め込みの代わりに表示する静的な要素)を使ってください。`data-astlide-static` を付けた要素は、印刷とエクスポートのときだけコンポーネントの上に重ねて表示され、発表中は隠れます。

```mdx
<div style="position: relative">
  <LiveMap client:only="react" />
  <img data-astlide-static src="/map-snapshot.png" alt="Map of our offices"
       style="position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover" />
</div>
```
