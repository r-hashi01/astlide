---
title: レイアウトとコンポーネント
description: 組み込みのスライドレイアウトと、MDX スライドで使えるコンポーネント。
---

## レイアウト

スライドごとに `slideLayout` でレイアウトを選びます。

| `slideLayout` | 説明 |
|---|---|
| `default` | 標準的なコンテンツスライド |
| `cover` | 中央寄せのタイトル / 締めのスライド |
| `section` | 章の区切り |
| `two-column` | `<Left>` / `<Right>` で左右に並べる |
| `image-full` | 背景画像の上にテキストを重ねる |
| `image-left` | 左に画像、右にテキスト |
| `image-right` | 右に画像、左にテキスト |
| `code` | コードブロック向けに余白を最適化 |
| `quote` | 中央寄せの引用 |
| `statement` | 大きな一文 |

プラグインでレイアウトを追加することもできます。[テーマとプラグイン](/ja/guides/themes-and-plugins/)を参照してください。

### 2 カラム

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

どのコンポーネントも、`.mdx` スライドでは import せずに使えます。

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
| `columns` | 列数（省略すると子要素から判定） |
| `gap` | 列の間隔（CSS の値、デフォルト `2rem`） |
| `align` | `start` \| `center` \| `end` \| `stretch` |
| `widths` | 列幅の指定。例: `1fr 2fr 1fr` |

### `<CodeBlock>`

コードフェンスを囲み、ファイル名のヘッダーとコピーボタンを付けます。

````mdx
<CodeBlock title="src/content.config.ts">
```ts
export const collections = { decks };
```
</CodeBlock>
````

行のハイライトについては[コード](/ja/guides/code/)を参照してください。

### `<Math>`

KaTeX を使い、ビルド時に描画します。

```mdx
Inline: <Math formula="\frac{x^2}{2}" />

<Math formula="\sum_{i=1}^n i^2 = \frac{n(n+1)(2n+1)}{6}" display />
```

### `<YouTube>`

プライバシー強化モードで埋め込みます。動画 ID と URL のどちらでも指定できます。

```mdx
<YouTube id="dQw4w9WgXcQ" start={42} />
```

エクスポートしたスライド（PDF / PPTX）ではプレーヤーを動かせないため、代わりに再生ボタン付きの動画サムネイルを表示し、動画へのリンクを張ります。

#### 独自の埋め込み用の静的な代替表示

要素に `data-astlide-static` を付けると、スライドを印刷・エクスポートするときに、動的な埋め込みの代わりにその要素が表示されます。それ以外の場面では非表示になります。要素自身に `display` を指定し、埋め込みの上に重なるよう配置してください。

```html
<div class="map" style="position: relative">
  <iframe src="https://maps.example.com/…"></iframe>
  <a href="https://maps.example.com/…" data-astlide-static style="position: absolute; inset: 0; display: block">
    <img src="/images/map.png" alt="" style="width: 100%; height: 100%; object-fit: cover" />
  </a>
</div>
```

代替表示のない `<iframe>` は、表示している内容に応じてエクスポートされます。

- 自分のサイトのページ（`srcdoc`、またはビルドに含まれるパス）は、スライドと同じようにフレーム内にレイアウトされます。
- 外部サイト（YouTube、Vimeo、Figma、CodePen、または oEmbed / Open Graph の情報を持つページ）は、サムネイルとタイトルにリンクを張った形になります。この情報はエクスポート時に取得してキャッシュされます。オフラインの場合は、ページ名を記したカードになります。

### `<Tweet>`

スタイル付きの静的なカードです。外部 API は呼び出しません。

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

[フラグメント](/ja/guides/fragments/)と[スピーカーノート](/ja/guides/decks/#スピーカーノート)を参照してください。
