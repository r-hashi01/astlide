---
title: デプロイ
description: 静的サイトとしてビルドし、好きなホスティングに置けます。GitHub Pages のようなサブパスにも置けます。
---

`astro build` を実行すると、`dist/` に静的サイトができます。静的ホスティングならどこでも配信できます。

## サブパスに置く（GitHub Pages）

Astlide は Astro の [`base`](https://docs.astro.build/ja/reference/configuration-reference/#base) オプションに従います。内部リンク、発表者ウィンドウのプレビュー、一覧のサムネイル、PDF エクスポートのどれも `base` を基準にパスを解決します。GitHub Pages のプロジェクトサイトなら、次のように設定します。

```js
// astro.config.mjs
export default defineConfig({
  site: "https://<user>.github.io",
  base: "/<repo>",
  integrations: [astlide()],
});
```

スライドへのリンクは、Astro の [`trailingSlash`](https://docs.astro.build/ja/reference/configuration-reference/#trailingslash) と [`build.format`](https://docs.astro.build/ja/reference/configuration-reference/#buildformat) にも従います。デフォルトの `directory` 形式では、リンクの末尾が `/` になります（`/<repo>/my-deck/3/`）。静的ホスティングが返す `index.html` の場所と一致するので、スライドを移動してもリダイレクトは起きません。

あとは GitHub Actions で `dist/` をデプロイします。手順は Astro の [GitHub Pages ガイド](https://docs.astro.build/ja/guides/deploy/github/)を参照してください。

:::note
`<ImageSide src>` と、画像を指定した `background` のルート相対パス（`/photo.jpg` など）は、Astlide が `base` を補って解決します。それ以外に自分で書いた絶対 URL は書き換えません。`![](/photo.jpg)` のような Markdown の画像、直接書いた `<img>`、リンクがこれに当たります。これらには相対パスか `import.meta.env.BASE_URL` を使ってください。
:::

## 検索エンジン

デッキはデフォルトで `noindex` です。検索エンジンにインデックスさせたい場合は [`indexable: true`](/ja/reference/configuration/) を設定してください。
