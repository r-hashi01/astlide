---
title: レイアウトとコンポーネント
description: 組み込みのスライドレイアウトと、MDX のスライドで使えるコンポーネントの一覧です。
---

## レイアウト

スライドごとに `slideLayout` でレイアウトを選びます。

| `slideLayout` | 説明 |
|---|---|
| `default` | 標準の本文スライド |
| `cover` | 中央寄せの表紙・締めのスライド |
| `section` | 章の区切り |
| `two-column` | `<Left>` と `<Right>` の中身を左右に並べる |
| `image-full` | 背景画像の上にテキストを重ねる |
| `image-left` | 左に画像、右にテキスト |
| `image-right` | 右に画像、左にテキスト |
| `code` | コードブロックが見やすいよう余白を調整したもの |
| `quote` | 中央寄せの引用 |
| `statement` | 一文だけを大きく見せる |

レイアウトはプラグインで追加できます。[テーマとプラグイン](/ja/guides/themes-and-plugins/)を参照してください。

### 2 段組み

```mdx
---
slideLayout: two-column
---
# Comparison

<Left>
### Before
Old approach
</Left>
<Right>
### After
New approach
</Right>
```

### 画像とテキスト

```mdx
---
slideLayout: image-left
---
<ImageSide src="/photo.jpg" alt="Photo" />
<TextPanel>
## Caption
Description text here.
</TextPanel>
```

## コンポーネント

ここで紹介するコンポーネントは、`.mdx` のスライドなら import なしで使えます。

### `<Columns>`

```mdx
<Columns columns={3} gap="1.5rem">
<div>

### Option A
First option details.

</div>
<div>

### Option B
Second option details.

</div>
<div>

### Option C
Third option details.

</div>
</Columns>
```

| プロパティ | 説明 |
|---|---|
| `columns` | 列数。省略すると子要素の数から決める |
| `gap` | 列の間隔。CSS の値で指定する（デフォルトは `2rem`） |
| `align` | `start` \| `center` \| `end` \| `stretch` |
| `widths` | 各列の幅（例: `1fr 2fr 1fr`） |

### `<CodeBlock>`

コードフェンスを囲むと、ファイル名の見出しとコピーボタンが付きます。

````mdx
<CodeBlock title="src/content.config.ts">
```ts
export const collections = { decks };
```
</CodeBlock>
````

特定の行を強調する方法は[コード](/ja/guides/code/)を参照してください。

### `<Math>`

数式を KaTeX で描画します。描画はビルド時に済ませます。

```mdx
Inline: <Math formula="\frac{x^2}{2}" />

<Math formula="\sum_{i=1}^n i^2 = \frac{n(n+1)(2n+1)}{6}" display />
```

### `<YouTube>`

YouTube の動画をプライバシー強化モードで埋め込みます。動画は ID でも URL でも指定できます。

```mdx
<YouTube id="dQw4w9WgXcQ" start={42} />
```

PDF や PPTX に書き出したスライドでは、プレーヤーは動きません。代わりに、再生ボタンを重ねた動画のサムネイルを表示し、動画へのリンクを張ります。

#### 埋め込みの代わりに表示する静的な要素

要素に `data-astlide-static` を付けると、スライドの印刷や書き出しのときだけ、動く埋め込みの代わりにその要素を表示します。それ以外のときは非表示です。この要素には自分で `display` を指定し、埋め込みの上に重なるように配置してください。

```html
<div class="map" style="position: relative">
  <iframe src="https://maps.example.com/…"></iframe>
  <a href="https://maps.example.com/…" data-astlide-static style="position: absolute; inset: 0; display: block">
    <img src="/images/map.png" alt="" style="width: 100%; height: 100%; object-fit: cover" />
  </a>
</div>
```

`data-astlide-static` の要素がない `<iframe>` は、中身に応じて次のように書き出します。

- 同じサイトのページ（`srcdoc`、またはビルドに含まれるパス）は、スライドと同じ方法でフレーム内に配置します。
- 外部のサイトは、サムネイルとタイトルを表示し、そのページへのリンクを張ります。対象は YouTube、Vimeo、Figma、CodePen のほか、oEmbed や Open Graph の情報を持つページです。サムネイルとタイトルは書き出し時に取得し、キャッシュします。オフラインのときは、ページ名を書いたカードになります。

### `<Tweet>`

ツイートを、スタイルを当てた静的なカードとして表示します。外部の API は呼び出しません。

```mdx
<Tweet
  url="https://x.com/astrodotbuild/status/1234567890"
  text="Astro 5.0 is here! 🚀"
  author="Astro"
  handle="@astrodotbuild"
  date="Dec 3, 2024"
/>
```

### `<Fragment>`、`<Fragments>`、`<SpeakerNotes>`

[段階表示](/ja/guides/fragments/)と[発表者ノート](/ja/guides/decks/#発表者ノート)を参照してください。
