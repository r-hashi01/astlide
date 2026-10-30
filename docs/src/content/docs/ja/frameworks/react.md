---
title: React
description: Astlide のスライド、レイアウト、コンポーネント、スライドページを React コンポーネントとして提供します。好きな React アプリにデッキのページを組み込めます。
---

`@astlide/react` は、Astlide のスライドを React のコンポーネントとして提供するパッケージです。Vite のアプリや Next.js 以外の React フレームワークなど、デッキのページを自分で組み立てるときに使います。Next.js なら [`@astlide/next`](/ja/frameworks/next/) を使ってください。

## 入っているもの

- **`<Slide>`**：スライド 1 枚です。Astro サイトと同じ frontmatter の項目（`layout`・`transition`・`background`・`className`）を受け取り、中身は children か `html` で渡します。
- **スライド用のコンポーネント**：Astro 版と同じ名前・同じマークアップです。`Columns`・`Left`・`Right`・`ImageSide`・`TextPanel`・`Fragment`・`Fragments`・`SpeakerNotes`（`Notes`）・`CodeBlock`・`Math`・`YouTube`・`Tweet` があります。
- **`createMdxComponents(settings)`**：上のコンポーネントを、MDX のスライドが使う名前で返します。`mdxComponents` は既定の設定で作ったものです。設定は 2 つあります。`resolveUrl` はベースパスの下で `/` から始まる URL を解決するためのもので、`notes` はスピーカーノートを出さないためのものです。
- **`<DeckPage>`**：ツールバー、プレゼンターウィンドウ、一覧表示、番号へのジャンプ、ペン、レーザーポインター、ノートを備えたスライドページです。ページ間の移動にはルーターの関数を `navigate` で渡します。渡さなければ、通常のページ遷移になります。
- **`@astlide/react/server`**：`renderMdxToHtml(source)` で、MDX のスライドをサーバー上で HTML にします。たとえば `@astlide/core/render` の `renderDeck` に渡せば、サイトなしで PDF や PPTX を作れます。

## スライドのページ

デッキは、サーバーかビルド時に `@astlide/core` で読みます。ページ `n` に出すものは `slidePage()` で取り出します。

```tsx
import { readDeck, renderNotesHtml } from "@astlide/core/deck";
import { slidePage } from "@astlide/core/deck/pages";
import { DeckPage, Slide } from "@astlide/react";

const deck = await readDeck("decks/my-talk");
const page = slidePage(deck, 3); // 3 枚目がなければ null
// 3 枚目が非表示なら page.redirectTo が入っているので、そこへ転送する
const notesHtml = page?.slide.notes ? await renderNotesHtml(page.slide.notes) : undefined;

// navigate はルーターの遷移関数（React Router の useNavigate() など）
export function SlidePage({ navigate }: { navigate: (url: string, o: { replace: boolean }) => void }) {
  if (!page) return null;
  const { slide } = page;
  return (
    <DeckPage
      deck={deck.name}
      slideNumber={page.number}
      totalSlides={page.totalSlides}
      prevSlide={page.prevSlide}
      nextSlide={page.nextSlide}
      firstSlide={page.firstSlide}
      lastSlide={page.lastSlide}
      outline={page.outline}
      deckContext={page.deckContext}
      notesHtml={notesHtml}
      basePath="/decks"
      navigate={navigate}
    >
      <Slide
        layout={slide.data.slideLayout}
        transition={slide.data.transition}
        background={slide.data.background}
        className={slide.data.class}
        slideNumber={page.number}
        totalSlides={page.totalSlides}
        html={slide.html}
      />
    </DeckPage>
  );
}
```

Markdown・HTML・PowerPoint のスライドは、サニタイズ済みの HTML として `slide.html` に入っています。MDX のスライドはソースのまま `slide.body` に入っているので、`@astlide/core/deck` でコンパイルします。

- **サーバーで**：`evaluateSlideMdx(slide.body, runtime)`（`import * as runtime from "react/jsx-runtime"`）がスライドのコンポーネントを返します。
- **ビルド時に**：`compileSlideMdx(slide.body)` が ES モジュール（`export default MDXContent`）のソースを返すので、バンドラーに渡します。

できたコンポーネントは `<Slide>` の中で、使うコンポーネントを渡して描画します。

```tsx
<Slide /* … */>
  <Content components={mdxComponents} />
</Slide>
```

スライドの置き場所は `<DeckPage>` が決めます。プレゼンターウィンドウ（URL に `?presenter` があるとき、または Astlide が開いたウィンドウ）として表示するときは `presenter` を渡してください。

## スタイル

次のものを一度だけ読み込みます。

```ts
import "@astlide/core/styles/base.css";
import "@astlide/core/styles/deck.css";
import "@astlide/core/styles/slide.css";
import "@astlide/core/styles/components.css";
import "@astlide/core/styles/print.css";
import "@astlide/core/styles/themes/default.css"; // デッキで使う他のテーマも
import "katex/dist/katex.min.css"; // <Math> 用
```

デッキのテーマは `<html data-theme="…">` で指定します。

## 書き出し用の印刷ビュー

`astlide export --base-url` は `/<deck>/all` を読みます。非表示のものを除いた全スライド（`@astlide/core/deck/pages` の `printSlides()`）を、1 ページに並べたものです。このページに `@astlide/core/deck/print-view` の `printViewAttributes(deck.config)` と `printViewMeta(deck)` で属性と `<meta>` を付ければ、PDF・PNG・PPTX は Astro サイトから書き出したものと同じになります。コマンドは [Next.js](/ja/frameworks/next/#書き出し) を見てください。
