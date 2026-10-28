---
title: レイアウトとコンポーネント
description: 組み込みのスライドレイアウトと、MDX のスライドで import せずに使えるコンポーネントの一覧です。
---

スライド上の配置はレイアウトで決めます。段組みや数式、動画のように Markdown だけでは書けないものには、コンポーネントを使います。

## レイアウト

レイアウトは、スライドの frontmatter の `slideLayout` で選びます。指定しなければ `default` になります。

| `slideLayout` | 見た目 |
|---|---|
| `default` | 標準の本文スライド |
| `cover` | 内容を中央に配置する。表紙や締めのスライド向け |
| `section` | 発表の章を区切るスライド |
| `two-column` | `<Left>` と `<Right>` の内容を左右に並べる |
| `image-full` | 画像をスライド全面に敷き、下部に暗いグラデーションを重ねてテキストを載せる。画像は `background` で指定する |
| `image-left` | 左半分に画像、右にテキスト |
| `image-right` | 右半分に画像、左にテキスト |
| `code` | 余白を詰めて、コードを広く表示する |
| `quote` | 引用を中央に配置する |
| `statement` | 一文だけを大きく中央に表示する |

レイアウトは、プラグインや PowerPoint テンプレートで追加することもできます。[テーマとプラグイン](/ja/guides/themes-and-plugins/)と [PowerPoint テンプレート](/ja/guides/templates/)を参照してください。

### 2 段組み

左右それぞれの内容を `<Left>` と `<Right>` で囲みます。下の例の見出しのように、どちらにも入れなかった要素は横幅いっぱいに表示します。

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

### 画像とテキストを左右に並べる

先に `<ImageSide>` を書き、続けてテキストを `<TextPanel>` で囲みます。`image-right` でも書く順番は同じです。画像を右側に移すのはレイアウトの役目です。

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

| `<ImageSide>` のプロパティ | 説明 |
|---|---|
| `src` | 画像の URL（必須）。`/` で始まるパスには Astro の `base` を付けます。 |
| `alt` | 代替テキスト。デフォルトは `""` です。 |
| `width` | スライドの横幅のうち、画像が占める割合。デフォルトは `50%` です。 |

### 画像を全面に敷く

`image-full` の画像は `background` で指定します。暗い画像の上で文字を読みやすくするには、`class: text-light` を付けてください。

```mdx
---
slideLayout: image-full
background: "/images/aurora.jpg"
class: text-light
---
# Northern lights
```

## コンポーネント

以下のコンポーネントは、`.mdx` のスライドなら import せずに使えます。`.md` と `.html` のスライドではコンポーネントを使えません。どのコンポーネントにも、CSS クラスを追加する `class` プロパティがあります。

### `<Columns>`

子要素を列に分けて並べます。`two-column` レイアウトと違って、どのスライドでも使え、列の数も自由です。

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

`<div>` の中身を Markdown として解釈させるには、上の例のように `<div>` の内側に空行を入れます。

| プロパティ | 説明 |
|---|---|
| `columns` | 列数。省略すると、子要素 1 つが 1 列になります。 |
| `gap` | 列の間隔。CSS の長さで指定します。デフォルトは `2rem` です。 |
| `align` | 縦方向のそろえ方。`start`・`center`・`end`・`stretch` から選びます。デフォルトは `start` です。 |
| `widths` | 各列の幅。`1fr 2fr 1fr` や `300px 1fr` のように、CSS グリッドの書式で指定します。指定すると `columns` より優先します。 |

### `<CodeBlock>`

コードフェンスを `<CodeBlock>` で囲むと、ファイル名とコピーボタンの付いたヘッダーが付きます。

````mdx
<CodeBlock title="src/content.config.ts">
```ts
export const collections = { decks };
```
</CodeBlock>
````

| プロパティ | 説明 |
|---|---|
| `title` | ヘッダーに出す文字列。ふつうはファイル名を書きます。省略できます。 |

特定の行を強調する方法は[コード](/ja/guides/code/)で説明しています。

### `<Math>`

LaTeX の数式を KaTeX で表示します。数式はビルド時に HTML にするので、ページで数式ライブラリを読み込むことはありません。

```mdx
Inline: <Math formula="\frac{x^2}{2}" />

<Math formula="\sum_{i=1}^n i^2 = \frac{n(n+1)(2n+1)}{6}" display />
```

| プロパティ | 説明 |
|---|---|
| `formula` | LaTeX の数式（必須）。 |
| `display` | 付けると、文中ではなく独立したブロックとして中央に表示します。 |

### `<YouTube>`

YouTube の動画を埋め込みます。プライバシー強化モード（`youtube-nocookie.com`）を使います。

```mdx
<YouTube id="dQw4w9WgXcQ" start={42} />
```

| プロパティ | 説明 |
|---|---|
| `id` | 動画の ID（必須）。`youtube.com` や `youtu.be` の URL をそのまま渡すこともできます。動画の ID を読み取れない値だと何も表示せず、警告をログに出します。 |
| `start` | 再生を始める位置（秒）。 |
| `title` | iframe のアクセシビリティ用タイトル。デフォルトは `"YouTube video"` です。 |

PDF や PPTX に書き出したスライドでは、動画を再生できません。代わりに、再生ボタンを重ねたサムネイルを表示し、動画へのリンクを張ります。

#### 自前の埋め込みに静的な代替を用意する

同じことは、ほかの埋め込みでもできます。要素に `data-astlide-static` を付けると、スライドを印刷したり書き出したりするときだけ、その要素が埋め込みの代わりに表示されます。それ以外のときは非表示です。

代替の要素は `<iframe>` と同じ親要素の中に置き、埋め込みの上に重ねてください。Astlide は非表示にするだけで `display` を設定しないので、`display` は自分で指定します。

```html
<div class="map" style="position: relative">
  <iframe src="https://maps.example.com/…"></iframe>
  <a href="https://maps.example.com/…" data-astlide-static style="position: absolute; inset: 0; display: block">
    <img src="/images/map.png" alt="" style="width: 100%; height: 100%; object-fit: cover" />
  </a>
</div>
```

代替を用意していない `<iframe>` は、表示しているページによって書き出し方が変わります。

- 自分のサイトのページ（`srcdoc`、またはビルドに含まれるパス）は、スライドと同じ方法でフレームの中にレイアウトします。
- 外部サイトのページは、サムネイルとタイトルを載せたカードになり、そのページにリンクします。YouTube、Vimeo、Figma、CodePen のほか、oEmbed や Open Graph の情報を持つページが対象です。情報は書き出しのときに取得してキャッシュします。オフラインなどで取得できなかったときは、ページ名だけのカードになります。

### `<Tweet>`

X（Twitter）の投稿をカードとして表示します。投稿の内容はプロパティで渡すので、ページから X へのリクエストは発生しません。カードをクリックすると、元の投稿が新しいタブで開きます。

```mdx
<Tweet
  url="https://x.com/astrodotbuild/status/1234567890"
  text="Astro 5.0 is here! 🚀"
  author="Astro"
  handle="@astrodotbuild"
  date="Dec 3, 2024"
/>
```

| プロパティ | 説明 |
|---|---|
| `url` | 投稿の URL（必須）。`http` と `https` のリンクだけを使います。 |
| `text` | 投稿の本文（必須）。`\n` で改行します。 |
| `author` | 表示名（必須）。 |
| `handle` | アカウント名（必須）。`@` は付けても付けなくてもかまいません。 |
| `date` | 表示する日付。書いたとおりに表示します。省略できます。 |
| `avatar` | プロフィール画像の URL。省略できます。 |

### `<Fragment>`、`<Fragments>`、`<SpeakerNotes>`

`<Fragment>` と `<Fragments>` は、内容を 1 つずつ順に表示するためのコンポーネントです。[段階表示](/ja/guides/fragments/)を参照してください。

`<SpeakerNotes>` には、発表中に自分だけが見るノートを書きます。`<Notes>` は同じコンポーネントの旧名です。[発表者ノート](/ja/guides/decks/#発表者ノート)を参照してください。
