---
title: デプロイ
description: 静的サイトとしてビルドし、どこにでもホストできます。GitHub Pages のようなサブパス配下にも対応しています。
---

`astro build` を実行すると `dist/` に静的サイトが出力され、どの静的ホスティングでも配信できます。

## サブパス配下に置く（GitHub Pages）

Astlide は Astro の [`base`](https://docs.astro.build/ja/reference/configuration-reference/#base) オプションに従います。内部リンクも、発表者ウィンドウのプレビューも、一覧表示のサムネイルも、PDF エクスポートも、すべて `base` を基準に解決されます。GitHub Pages のプロジェクトサイトの場合は次のように設定します。

```js
// astro.config.mjs
export default defineConfig({
  site: "https://<user>.github.io",
  base: "/<repo>",
  integrations: [astlide()],
});
```

スライドへのリンクは Astro の [`trailingSlash`](https://docs.astro.build/ja/reference/configuration-reference/#trailingslash) と [`build.format`](https://docs.astro.build/ja/reference/configuration-reference/#buildformat) にも従います。デフォルトの `directory` 形式ではリンクが `/` で終わります（`/<repo>/my-deck/3/`）。静的ホスティングが配信する `index.html` の場所と一致するので、スライド間を移動してもリダイレクトは起きません。

あとは GitHub Actions で `dist/` をデプロイします。Astro の [GitHub Pages ガイド](https://docs.astro.build/ja/guides/deploy/github/)を参照してください。

:::note
`<ImageSide src>` や画像の `background` に書いたルート相対パス（`/photo.jpg` など）は、自動的に `base` を基準に解決されます。それ以外の自分で書いた絶対 URL（`![](/photo.jpg)` のような Markdown 画像、`<img>` タグ、リンク）は書き換えられないので、相対パスか `import.meta.env.BASE_URL` を使ってください。
:::

## 検索エンジン

デッキはデフォルトで `noindex` になっています。検索エンジンにインデックスさせるには [`indexable: true`](/astlide/ja/reference/configuration/) を設定してください。
