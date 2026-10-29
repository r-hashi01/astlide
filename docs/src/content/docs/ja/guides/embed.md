---
title: デッキの埋め込み
description: <astlide-deck> 要素で、ブログ記事やドキュメント、React / Vue のアプリにデッキを表示します。
---

ビルドしたデッキは、ブログ記事やドキュメントのページ、Next.js や Nuxt のアプリなど、ほかのページの中に表示できます。使うのは `<astlide-deck>` カスタム要素です。デッキは iframe に読み込まれ、コンテナの幅に合わせて 16:9 で表示されます。埋め込んだページの側からは、スライドの移動やフルスクリーン表示ができ、スライドが変わったことも検知できます。

埋め込んだデッキに表示されるのはスライドだけです。ツールバー、進捗バー、ノートは出ません。見る人はデッキをクリックすれば、矢印キー、Space、Page Up / Down、Home、End でスライドを移動できます。スライドを移動しても、埋め込み先のページの履歴は増えません。

## 同じ Astro サイト内で使う

同じ Astro サイトの別のページに埋め込むときは、`DeckEmbed` コンポーネントを使います。デッキの URL には Astro の [`base`](/ja/guides/deploy/) が自動で付きます。

```astro
---
import DeckEmbed from "@astlide/astro/components/DeckEmbed.astro";
---

<DeckEmbed deck="my-talk" />
<DeckEmbed deck="my-talk" start={3} controls title="My talk" />
```

`.mdx` のページでも使えます。JavaScript が使えない環境では、デッキの代わりにデッキへのリンクが表示されます。

| プロパティ | デフォルト | |
| --- | --- | --- |
| `deck` | — | デッキ名（`src/content/decks/` にあるフォルダー名） |
| `start` | `1` | 最初に表示するスライド |
| `controls` | `false` | デッキの下に、前へ・次へのボタン、スライド番号、フルスクリーンのボタンを表示する |
| `title` | デッキ名 | フレームのアクセシブルネーム。スクリーンリーダーが読み上げる名前です |
| `class` | — | 追加する CSS クラス |

## ほかのページで使う

要素を一度だけ読み込み、`src` にデッキのルート URL を指定します。

```html
<script type="module">
  import "@astlide/core/embed";
</script>

<astlide-deck src="https://example.com/talks/my-talk/" start="2" controls></astlide-deck>
```

この `import` を動かすには、Vite などのバンドラーか、スクリプトをバンドルしてくれるフレームワークが必要です。

スライドの URL は、`src` の末尾にスラッシュがあるかどうかで変わります。`…/my-talk/` なら `…/my-talk/2/` を、`…/my-talk` なら `…/my-talk/2` を読み込みます。デッキのサイトをビルドしたときの形式に合わせてください。Astro のデフォルトの `directory` 形式なら、末尾にスラッシュを付けます。

### 属性

| 属性 | デフォルト | |
| --- | --- | --- |
| `src` | 必須 | デッキのルート URL。`http` / `https` の絶対 URL か、ページからの相対 URL で指定します。`javascript:` などそれ以外のスキームは無視されます |
| `start` | `1` | 最初に表示するスライド。あとから値を変えると、そのスライドに移動します |
| `controls` | オフ | コントロールバー（前へ、スライド番号、次へ、フルスクリーン）を表示する |
| `label` | `"Slide deck"` | フレームのアクセシブルネーム |

### メソッドとプロパティ

```js
const deck = document.querySelector("astlide-deck");

deck.next();              // next step, or next slide
deck.prev();              // previous step, or previous slide
deck.goTo(5);             // slide 5
deck.requestFullscreen(); // the standard fullscreen API

deck.slide; // current slide (0 until loaded)
deck.total; // number of slides
deck.step;  // steps revealed on the current slide
```

メソッドはデッキの読み込みが終わる前に呼んでもかまいません。呼び出しは保留され、デッキの準備ができた時点で実行されます。

要素自体もキーボードのフォーカスを受け取れます。フォーカスがあるあいだは、← / →、Page Up / Down、Space、Home、End と `f`（フルスクリーン）のキーも使えます。

### イベント

`slidechange` イベントは、デッキの読み込みが終わったときに 1 回発生し、その後はスライドかステップが変わるたびに発生します。イベントはバブリングします。`event.detail` の中身は次のとおりです。

```ts
interface SlideChangeDetail {
  deck: string;  // deck name
  slide: number; // 1-based
  total: number;
  step: number;  // steps revealed on this slide (0 = none)
  steps: number; // steps this slide has
}
```

```js
deck.addEventListener("slidechange", (e) => {
  console.log(`slide ${e.detail.slide} of ${e.detail.total}`);
});
```

### サイズ

要素はブロック要素で、幅はコンテナいっぱい、フレームの比率は 16:9 です。比率が 16:9 でないデッキでは、`--astlide-aspect-ratio` で指定します。

```css
astlide-deck {
  max-width: 960px;
  --astlide-aspect-ratio: 4 / 3;
}
```

要素の内部には、`::part(frame)`、`::part(iframe)`、`::part(controls)` でスタイルを当てられます。

## React

```tsx
import { useRef } from "react";
import { AstlideDeck, type AstlideDeckElement } from "@astlide/core/embed/react";

export function Talk() {
  const deck = useRef<AstlideDeckElement>(null);
  return (
    <>
      <AstlideDeck
        ref={deck}
        src="https://example.com/talks/my-talk/"
        controls
        onSlideChange={(e) => console.log(e.detail.slide)}
      />
      <button onClick={() => deck.current?.next()}>Next</button>
    </>
  );
}
```

ref には `<astlide-deck>` 要素そのものが入るので、上で紹介したメソッドとプロパティをそのまま使えます。コンポーネントは Next.js や Remix などのサーバーサイドレンダリングにも対応しています。要素が動き出すのは、ブラウザで読み込まれてからです。`react` は `@astlide/core` の省略可能な peer dependency です。

## Vue

```vue
<script setup lang="ts">
import { ref } from "vue";
import { AstlideDeck } from "@astlide/core/embed/vue";

const deck = ref();
</script>

<template>
  <AstlideDeck
    ref="deck"
    src="https://example.com/talks/my-talk/"
    :start="2"
    controls
    @slidechange="(d) => console.log(d.slide)"
  />
  <button @click="deck.next()">Next</button>
</template>
```

`slidechange` のハンドラーには、イベントの `detail` が渡されます。コンポーネントの ref からは `next()`、`prev()`、`goTo(n)`、`requestFullscreen()` を呼べます。要素そのものは `element` で参照できます。Nuxt などのサーバーサイドレンダリングにも対応しています。`vue` は `@astlide/core` の省略可能な peer dependency です。

## 仕組み

要素とデッキは `postMessage` でやり取りします。受け取るメッセージは、どちらの側でも絞り込んでいます。

- デッキのページがメッセージを受け取るのは、フレーム内に表示されているときだけで、相手は親ウィンドウに限ります。状態を送る先は、最初に通信してきたページのオリジンだけです。
- 要素の側は、自分の iframe から届いた、デッキのオリジンのメッセージしか受け取りません。
- メッセージでできる操作は、デッキの中での移動だけです。

別のドメインにあるデッキも、そのサーバーがフレーム内での表示を許可していれば埋め込めます。デッキのサーバーが `X-Frame-Options` や、`frame-ancestors` を含む Content Security Policy を返していないか確認してください。自分のデッキを埋め込めるサイトを制限する方法は、[iframe での埋め込みを制限する](/ja/reference/configuration/#iframe-での埋め込みを制限する)を参照してください。
