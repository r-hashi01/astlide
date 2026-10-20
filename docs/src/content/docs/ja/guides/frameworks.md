---
title: React・Vue・Svelte のコンポーネント
description: React、Vue、Svelte、Solid、Preact のコンポーネントをスライドで使います。ブラウザではインタラクティブに動き、PDF と PPTX では最初の状態で出力されます。
---

Astlide は Astro のインテグレーションなので、スライドでは Astro が対応しているフレームワーク（React、Vue、Svelte、Solid、Preact）のコンポーネントを使えます。手持ちのグラフやデモ用ウィジェット、デザインシステムのコンポーネントを、スライド用に書き直さずにそのまま持ち込めます。

## セットアップ

Astlide と並べて、フレームワークの Astro インテグレーションを追加します。

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

`.mdx` スライドの先頭でインポートし、ほかの要素と同じように使います。

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

`client:*` ディレクティブを付けないコンポーネントはビルド時に HTML に変換され、JavaScript は送られません。操作に反応する必要のないグラフや図ならこれで十分です。発表中にインタラクティブに動かしたい場合は [`client:load`](https://docs.astro.build/ja/reference/directives-reference/#client-directives)（または `client:visible`、`client:idle`）を付けてください。

異なるフレームワークのコンポーネントを同じスライドに並べることもできます。

## PDF と PPTX での表示

エクスポートでは、コンポーネントは**最初に描画された状態**で出力されます。

- **PDF / PNG**（ブラウザで描画）: `client:*` のコンポーネントが起動した後の、スライドを読み込んだ時点の表示です。
- **PPTX**（ブラウザを使わずにレイアウト）: コンポーネントをサーバーで描画した HTML です。テキスト、ボックス、SVG は、スライドのほかの部分と同じく編集可能な図形になります。

ブラウザでのみ描画されるコンポーネント（`client:only`）はビルド時の HTML を持たないため、PPTX には含まれません。サーバーで描画される状態を用意するか、[静的な代替表示](/astlide/ja/guides/layouts-and-components/#独自の埋め込み用の静的な代替表示)を使ってください。`data-astlide-static` を付けた要素は、印刷やエクスポートではコンポーネントの上に表示され、発表中は非表示になります。

```mdx
<div style="position: relative">
  <LiveMap client:only="react" />
  <img data-astlide-static src="/map-snapshot.png" alt="Map of our offices"
       style="position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover" />
</div>
```
