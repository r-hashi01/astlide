---
title: デプロイ
description: 静的サイトとしてビルドし、好きなホスティングサービスで公開します。GitHub Pages のようなサブパスでの公開にも対応しています。
---

`astro build` を実行すると、`dist/` に静的サイトが出力されます。このフォルダーを、静的サイトを配信できるホスティングサービスにアップロードすれば公開できます。

このビルドには、[`notes: "public"`](/ja/guides/decks/#発表者ノート) を設定しない限り発表者ノートは入りません。

## サブパスで公開する（GitHub Pages）

GitHub Pages のプロジェクトサイトは、`https://<user>.github.io/<repo>/` のようなサブパスで配信されます。このパスは Astro の [`base`](https://docs.astro.build/ja/reference/configuration-reference/#base) オプションで指定します。

```js
// astro.config.mjs
export default defineConfig({
  site: "https://<user>.github.io",
  base: "/<repo>",
  integrations: [astlide()],
});
```

Astlide が生成するリンクには、すべて `base` が付きます。スライド間のリンク、発表者ウィンドウのプレビュー、一覧のサムネイル、PDF エクスポートで描画するページも同様です。

スライドへのリンクは、Astro の [`trailingSlash`](https://docs.astro.build/ja/reference/configuration-reference/#trailingslash) と [`build.format`](https://docs.astro.build/ja/reference/configuration-reference/#buildformat) の設定にも従います。デフォルトの `directory` 形式では、`/<repo>/my-deck/3/` のように末尾がスラッシュになります。静的ホスティングが返す `index.html` の場所と一致するため、スライドを移動してもリダイレクトは発生しません。

GitHub Actions で `dist/` を公開する手順は、Astro の [GitHub Pages ガイド](https://docs.astro.build/ja/guides/deploy/github/)を参照してください。

:::note
`<ImageSide src>` や、画像を指定した `background` に `/photo.jpg` のようなルート相対パスを書くと、Astlide が `base` を補います。それ以外の場所に書いた絶対パスは書き換えません。Markdown の画像（`![](/photo.jpg)`）、直接書いた `<img>` タグ、リンクなどです。これらには相対パスか `import.meta.env.BASE_URL` を使ってください。
:::

## 検索エンジン

スライドのページには、デフォルトで `noindex, nofollow` が付きます。検索エンジンにインデックスさせたい場合は、[`indexable: true`](/ja/reference/configuration/) を設定してください。

デッキの全スライドを並べたページ（`/<deck>/all`）は、この設定にかかわらず `noindex` のままです。Astlide が `/` に生成する、デッキを並べたトップページには、このタグは付きません。

## デッキを埋め込めるサイトを制限する

ホスティング側で何も設定しなければ、どのサイトでも自分のデッキを iframe で表示できてしまいます。制限するには、`frame-ancestors` を含む Content-Security-Policy ヘッダーをホスティングから返すように設定します。設定例は[iframe での埋め込みを制限する](/ja/reference/configuration/#iframe-での埋め込みを制限する)を、埋め込みの仕組みは[デッキの埋め込み](/ja/guides/embed/)を参照してください。
