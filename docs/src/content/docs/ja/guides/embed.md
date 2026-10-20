---
title: デッキの埋め込み
description: <astlide-deck> 要素を使って、ブログ記事やドキュメントのページ、React / Vue のアプリの中にデッキを表示します。
---

ビルドしたデッキは、ブログ記事、ドキュメントのページ、Next.js や Nuxt のアプリなど、ほかのページの中に置けます。`<astlide-deck>` カスタム要素はデッキを iframe で読み込み、コンテナの幅に合わせて 16:9 を保ちます。ページ側からは、次へ / 前へ / 指定したスライドへの移動、フルスクリーン表示ができ、スライドが変わるたびにイベントを受け取れます。

フレーム内のデッキは、ツールバー、プログレスバー、ノートといった UI を隠してスライドだけを表示します。デッキをクリックすると、矢印キー、Space、Page Up / Down、Home、End で操作できます。スライドを移動してもホストページの履歴にはエントリーが追加されません。

## 同じ Astro サイトの別のページで使う

`DeckEmbed` コンポーネントを使います。デッキの URL は Astro の [`base`](/ja/guides/deploy/) を考慮して解決されます。

```astro
---
import DeckEmbed from "@astlide/core/components/DeckEmbed.astro";
---

<DeckEmbed deck="my-talk" />
<DeckEmbed deck="my-talk" start={3} controls title="My talk" />
```

`.mdx` のページでも使えます。JavaScript が無効な環境では、代わりにデッキへのリンクが表示されます。

| プロパティ | デフォルト | |
| --- | --- | --- |
| `deck` | — | デッキ名（`src/content/decks/` 以下のディレクトリ名） |
| `start` | `1` | 最初に表示するスライド |
| `controls` | `false` | デッキの下に前へ / 次へ、スライド番号、フルスクリーンのボタンを表示する |
| `title` | デッキ名 | フレームのアクセシブルな名前 |
| `class` | — | 追加の CSS クラス |

## 任意の HTML ページで使う

要素を一度だけインポートし（バンドラーから `import "@astlide/core/embed"`）、`src` にデッキのルート URL を指定します。

```html
<script type="module">
  import "@astlide/core/embed";
</script>

<astlide-deck src="https://example.com/talks/my-talk/" start="2" controls></astlide-deck>
```

スライドの URL は `src` の末尾のスラッシュで決まります。`…/my-talk/` なら `…/my-talk/2/` を、`…/my-talk` なら `…/my-talk/2` を読み込みます。デッキのサイトのビルド方法に合わせてください（デフォルトの `directory` 形式ではスラッシュが付きます）。

### 属性

| 属性 | | |
| --- | --- | --- |
| `src` | 必須 | デッキのルート URL（絶対 URL、またはページからの相対 URL） |
| `start` | `1` | 最初に表示するスライド。後から変更するとそのスライドへ移動します |
| `controls` | オフ | コントロールバー（前へ、スライド番号、次へ、フルスクリーン）を表示する |
| `label` | `"Slide deck"` | フレームのアクセシブルな名前 |

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

デッキの読み込みが終わる前に呼び出した操作はキューに入り、デッキの準備ができた時点で送られます。要素自体にフォーカスがあるときは、← / → / Home / End と `f`（フルスクリーン）も使えます。

### イベント

`slidechange` は、デッキの読み込みが終わったときと、スライドまたはステップが変わるたびに発火します。イベントはバブリングし、`event.detail` は次の形です。

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

要素はコンテナと同じ幅のブロックで、フレームは 16:9 です。ほかの比率のデッキでは `--astlide-aspect-ratio` を指定します。

```css
astlide-deck {
  max-width: 960px;
  --astlide-aspect-ratio: 4 / 3;
}
```

各部分は `::part(frame)`、`::part(iframe)`、`::part(controls)` でスタイルを指定できます。

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

ref には `<astlide-deck>` 要素がそのまま入るので、`next()` などのメソッドやプロパティをそのまま使えます。コンポーネントはサーバーでも描画でき（Next.js、Remix など）、ブラウザで読み込まれた時点で動き始めます。`react` は `@astlide/core` の省略可能な peer dependency です。

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

`@slidechange` のハンドラーには `event.detail` の内容が渡されます。コンポーネントは `next()`、`prev()`、`goTo(n)`、`requestFullscreen()`、`element` を公開しています。サーバーでも描画できます（Nuxt など）。`vue` は `@astlide/core` の省略可能な peer dependency です。

## 仕組み

要素とデッキは `postMessage` でやり取りします。デッキのページがメッセージを受け付けるのは、フレームの中に置かれたときの、親ウィンドウからのものだけです。状態は、最初に通信してきたページのオリジンにだけ報告します。要素は自身のフレームとデッキのオリジンからのメッセージだけを受け付けます。コマンドで操作できるのはデッキ内の移動だけです。

別のドメインでホストされているデッキも、そのホストがフレームへの埋め込みを許可していれば埋め込めます。デッキのサーバーに `X-Frame-Options` や `frame-ancestors` の Content Security Policy が設定されていないか確認してください。
