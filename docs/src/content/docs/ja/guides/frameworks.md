---
title: React・Vue・Svelte のコンポーネント
description: React、Vue、Svelte、Solid、Preact のコンポーネントをスライドで使う方法です。ブラウザでは操作でき、PDF と PPTX には最初に描画された状態で出力されます。
---

Astlide は Astro の上で動くので、Astro が対応しているフレームワークのコンポーネントをスライドで使えます。対象は React、Vue、Svelte、Solid、Preact です。手元にあるグラフやデモ用のウィジェット、デザインシステムのコンポーネントを、書き直さずにそのままスライドに載せられます。

## セットアップ

使うフレームワークの Astro インテグレーションをプロジェクトに追加します。

```bash
bunx astro add react    # or: vue, svelte, solid-js, preact
```

`astro add` はパッケージをインストールし、`astro.config.mjs` にインテグレーションを書き足します。実行後の設定は、次のように Astlide とフレームワークが並んだ形になります。

```js
// astro.config.mjs
import astlide from "@astlide/astro";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [react(), astlide()],
});
```

## スライドでコンポーネントを使う

`.mdx` のスライドの先頭でコンポーネントを import すれば、あとはほかのタグと同じように書けます。

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

import のパスは、スライドのファイルからの相対パスです。`src/content/decks/<デッキ名>/` に置いたスライドからは、`../../../components/` が `src/components/` を指します。

何も指定しなければ、Astro はコンポーネントをビルド時に HTML にし、JavaScript はブラウザに送りません。操作に反応しなくてよいグラフや図なら、これで十分です。発表中に操作したいコンポーネントには、`client:load`・`client:visible`・`client:idle` などの [`client:*` ディレクティブ](https://docs.astro.build/ja/reference/directives-reference/#client-directives)を付けます。

1 枚のスライドに、別々のフレームワークのコンポーネントを混ぜて置くこともできます。

## PDF と PPTX での表示

書き出したファイルには、コンポーネントが最初に描画された状態で入ります。具体的な中身は形式によって違います。

- **PDF と PNG** は、ブラウザで描画して作ります。スライドを読み込み、`client:*` のコンポーネントが動き出した直後の画面が入ります。
- **PPTX** は、ブラウザを使わずにレイアウトして作ります。元になるのは、コンポーネントをサーバーで描画した HTML です。テキスト、ボックス、SVG は、スライドのほかの部分と同じく編集できる図形になります。

`client:only` を付けたコンポーネントはブラウザでしか描画しないため、ビルド時の HTML がありません。そのため PPTX には出てきません。対処するには、サーバーでも描画できるようにするか、[静的な代替](/ja/guides/layouts-and-components/#自前の埋め込みに静的な代替を用意する)を用意します。`data-astlide-static` を付けた要素は、印刷と書き出しのときだけコンポーネントの上に表示され、発表中は隠れます。

```mdx
<div style="position: relative">
  <LiveMap client:only="react" />
  <img data-astlide-static src="/map-snapshot.png" alt="Map of our offices"
       style="position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover" />
</div>
```
