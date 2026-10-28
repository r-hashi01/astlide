---
title: デッキの埋め込み
description: <astlide-deck> 要素で、ブログ記事やドキュメント、React / Vue のアプリにデッキを表示します。
---

ビルドしたデッキは、ほかのページに埋め込めます。ブログ記事やドキュメントのページ、Next.js や Nuxt のアプリにも置けます。

埋め込みには `<astlide-deck>` カスタム要素を使います。デッキは iframe で読み込まれ、コンテナの幅いっぱいに 16:9 で表示されます。埋め込んだページからは、次へ・前へ・指定したスライドへの移動とフルスクリーン表示を操作できます。スライドが変わるたびにイベントも届きます。

埋め込んだデッキには、スライドだけが表示されます。ツールバー、進捗バー、ノートは出ません。デッキをクリックすれば、矢印キー、Space、Page Up / Down、Home、End で操作できます。スライドを移動しても、埋め込み先のページの履歴は増えません。

## 同じ Astro サイトの別のページで使う

`DeckEmbed` コンポーネントを使います。デッキの URL には Astro の [`base`](/ja/guides/deploy/) が自動で付きます。

```astro
---
import DeckEmbed from "@astlide/core/components/DeckEmbed.astro";
---

<DeckEmbed deck="my-talk" />
<DeckEmbed deck="my-talk" start={3} controls title="My talk" />
```

`.mdx` のページでも使えます。JavaScript が動かない環境では、デッキの代わりにデッキへのリンクを表示します。

| プロパティ | デフォルト | |
| --- | --- | --- |
| `deck` | — | デッキ名（`src/content/decks/` 以下のディレクトリ名） |
| `start` | `1` | 最初に表示するスライド |
| `controls` | `false` | デッキの下に、前へ・次へのボタン、スライド番号、フルスクリーンのボタンを表示する |
| `title` | デッキ名 | フレームのアクセシブルネーム（支援技術が読み上げる名前） |
| `class` | — | 追加の CSS クラス |

## 任意の HTML ページで使う

まず、バンドラー経由で要素を一度だけ読み込みます（`import "@astlide/core/embed"`）。あとは `src` にデッキのルート URL を指定します。

```html
<script type="module">
  import "@astlide/core/embed";
</script>

<astlide-deck src="https://example.com/talks/my-talk/" start="2" controls></astlide-deck>
```

`src` の末尾にスラッシュがあるかどうかで、スライドの URL が変わります。`…/my-talk/` なら `…/my-talk/2/` を、`…/my-talk` なら `…/my-talk/2` を読み込みます。デッキのサイトのビルド設定に合わせてください。デフォルトの `directory` 形式なら、末尾にスラッシュが付きます。

### 属性

| 属性 | | |
| --- | --- | --- |
| `src` | 必須 | デッキのルート URL。`http` / `https` の絶対 URL か、ページからの相対 URL で指定する。`javascript:` などほかのスキームは無視する |
| `start` | `1` | 最初に表示するスライド。あとから値を変えると、そのスライドへ移動する |
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

デッキの読み込み前に呼んだメソッドは、いったん溜めておき、デッキから準備完了の通知が来た時点で送ります。要素そのものにフォーカスがあるときは、← / → / Home / End と `f`（フルスクリーン）のキーも使えます。

### イベント

`slidechange` イベントは、デッキの読み込みが終わったときに 1 回、その後はスライドかステップが変わるたびに発生します。イベントはバブリングします。`event.detail` の型は次のとおりです。

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

要素はブロック要素で、幅はコンテナと同じ、フレームの比率は 16:9 です。16:9 以外のデッキでは `--astlide-aspect-ratio` で比率を指定します。

```css
astlide-deck {
  max-width: 960px;
  --astlide-aspect-ratio: 4 / 3;
}
```

要素の中の各部分には、`::part(frame)`、`::part(iframe)`、`::part(controls)` でスタイルを当てられます。

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

ref には `<astlide-deck>` 要素そのものが入ります。前述のメソッドとプロパティをそのまま使えます。コンポーネントは Next.js や Remix などでのサーバー描画にも対応しています。要素が動き出すのはブラウザに読み込まれてからです。`react` は `@astlide/core` の省略可能な peer dependency です。

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

`slidechange` のハンドラーには、イベントの `detail` が渡されます。コンポーネントからは `next()`、`prev()`、`goTo(n)`、`requestFullscreen()`、`element` を使えます。Nuxt などでのサーバー描画にも対応しています。`vue` は `@astlide/core` の省略可能な peer dependency です。

## 仕組み

要素とデッキは `postMessage` で通信します。デッキのページは、フレームに埋め込まれているときだけ、親ウィンドウからのメッセージを受け取ります。状態を知らせる先は、最初に通信してきたページのオリジンだけです。要素の側も、自分のフレームからの、デッキのオリジンのメッセージしか受け取りません。メッセージでできる操作は、デッキ内の移動に限られます。

別のドメインにあるデッキも、そのサーバーが iframe での表示を許可していれば埋め込めます。デッキのサーバーで `X-Frame-Options` や、Content Security Policy の `frame-ancestors` が設定されていないか確認してください。
