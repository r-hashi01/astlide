---
title: Vue
description: Astlide のスライド、レイアウト、コンポーネント、スライドページを Vue コンポーネントとして提供します。好きな Vue アプリにデッキのページを組み込めます。
---

`@astlide/vue` は、Astlide のスライドを Vue のコンポーネントとして提供するパッケージです。Vite のアプリなど、デッキのページを自分で組み立てるときに使います。Nuxt なら [`@astlide/nuxt`](/ja/frameworks/nuxt/) を使ってください。

コンポーネントは `.vue` ファイル、JSX、render 関数のどこからでも使えます。

## 入っているもの

- **`Slide`**：スライド 1 枚です。Astro サイトと同じ frontmatter の項目（`layout`・`transition`・`background`・`className`）を受け取り、中身は default スロットか `html` で渡します。
- **スライド用のコンポーネント**：Astro 版と同じ名前・同じマークアップです。`Columns`・`Left`・`Right`・`ImageSide`・`TextPanel`・`Fragment`・`Fragments`・`SpeakerNotes`（`Notes`）・`CodeBlock`・`Math`・`YouTube`・`Tweet` があります。
- **`createMdxComponents(settings)`**：上のコンポーネントを、MDX のスライドが使う名前で返します。`mdxComponents` は既定の設定で作ったものです。設定の `resolveUrl` はベースパスの下で `/` から始まる URL を解決するため、`notes` はスピーカーノートを出さないためのものです。
- **`DeckPage`**：ツールバー、プレゼンターウィンドウ、一覧表示、番号へのジャンプ、ペン、レーザーポインター、ノートを備えたスライドページで、スライドは default スロットに入れます。ページ間の移動には、`(url, { replace }) => (replace ? router.replace(url) : router.push(url))` のようにルーターの関数を `navigate` で渡します。
- **`@astlide/vue/jsx-runtime`**：Vue で MDX のスライドを動かすための JSX ランタイムです。コンポーネントの子要素を、Vue の流儀どおり default スロットとして渡します。
- **`@astlide/vue/server`**：`compileMdxComponent(source)` は MDX のスライドをサーバー上で Vue コンポーネントにし、`renderMdxToHtml(source)` は HTML にします。たとえば `@astlide/core/render` の `renderDeck` に渡せば、サイトなしで PDF や PPTX を作れます。

## スライドと MDX

デッキは、サーバーかビルド時に `@astlide/core/deck` の `readDeck()` で読みます。`DeckPage` に渡すもの（スライド、前後・最初・最後のスライド、アウトライン、デッキの情報）は、`@astlide/core/deck/pages` の `slidePage(deck, n)` で取り出します。

Markdown・HTML・PowerPoint のスライドは、サニタイズ済みの HTML として `slide.html` に入っているので、そのまま `html` に渡します。MDX のスライドはソースのまま `slide.body` に入っています。

- **ビルド時に**：`@astlide/core/deck` の `compileSlideMdx(slide.body, { jsxImportSource: "@astlide/vue" })` が ES モジュール（`export default MDXContent`）のソースを返すので、バンドラーに渡します。
- **サーバーで**：`@astlide/vue/server` の `compileMdxComponent(slide.body)` を使います。

できたコンポーネントは、`Slide` の default スロットの中で `components` を渡して描画します。

```ts
h(Slide, { layout: slide.data.slideLayout, slideNumber: page.number, totalSlides: page.totalSlides }, () =>
  h(Content, { components: mdxComponents }),
);
```

## スタイル

次のものを一度だけ読み込みます。

```ts
import "@astlide/core/styles/base.css";
import "@astlide/core/styles/deck.css";
import "@astlide/core/styles/slide.css";
import "@astlide/core/styles/components.css";
import "@astlide/core/styles/print.css";
import "@astlide/core/styles/themes/default.css"; // デッキで使う他のテーマも
import "katex/dist/katex.min.css"; // Math 用
```

デッキのテーマは `<html data-theme="…">` で指定します。

## 書き出し用の印刷ビュー

`astlide export --base-url` は `/<deck>/all` を読みます。非表示のものを除いた全スライド（`@astlide/core/deck/pages` の `printSlides()`）を、1 ページに並べたものです。このページに `@astlide/core/deck/print-view` の `printViewAttributes(deck.config)` と `printViewMeta(deck)` で属性と `<meta>` を付ければ、PDF・PNG・PPTX は Astro サイトから書き出したものと同じになります。コマンドは [Nuxt](/ja/frameworks/nuxt/#書き出し) を見てください。
