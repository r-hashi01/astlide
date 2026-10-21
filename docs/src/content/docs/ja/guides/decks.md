---
title: デッキを作成する
description: デッキのフォルダ、_config.json、.mdx・.md・.html のスライドファイル、frontmatter について。
---

デッキは `src/content/decks/` の下にあるフォルダです。スライドは番号付きのファイルで、ファイル名順に並びます。

## CLI で雛形を作る

```bash
bunx create-astlide deck my-talk --theme dark --format mdx   # or md | html
```

## 手動で作る

1. `src/content/decks/my-talk/_config.json` を追加します。

   ```json
   {
     "title": "My Talk",
     "author": "Your Name",
     "date": "2025-01-15",
     "theme": "default"
   }
   ```

2. スライドを番号付きのファイルとして追加します。`.mdx`、`.md`、`.html` は混在させられます。

   ```
   src/content/decks/my-talk/
   ├── _config.json
   ├── 01-cover.mdx
   ├── 02-intro.md
   └── 03-demo.html
   ```

URL のスライド番号（`/my-talk/2`）は、ソートしたファイルの順番に対応します。

## スライドの形式

- **`.mdx`** — Markdown にコンポーネント（`<Fragment>`、`<Columns>`、`<SpeakerNotes>` など）を組み合わせられます。Astlide のコンポーネントは import せずに使えます。
- **`.md`** — 素の Markdown です。コードのハイライトや図も使えます。
- **`.html`** — 単体で完結した HTML のスライドです。body の中身がそのまま描画され、インラインの `<style>` も効きます（MDX と同じく、書いた内容をそのまま信頼して表示します）。手で書いた HTML や AI が生成した HTML を貼り付けるのに向いています。

```html
---
slideLayout: cover
background: "#0b132b"
---
<style>.hero { font-size: 3rem; }</style>
<h1 class="hero">Everything in one HTML file</h1>
```

## frontmatter

```yaml
---
slideLayout: default
transition: fade
title: "Optional — used by the go-to-slide dialog"
background: "#1e293b"
class: "text-light"
notes: "Speaker notes shown in presenter / notes mode"
hidden: false
---
```

:::caution
`layout` ではなく **`slideLayout`** を使ってください。`layout` は Astro の MDX パイプラインの予約語です。
:::

すべてのフィールドは [frontmatter リファレンス](/ja/reference/frontmatter/)を、組み込みの `slideLayout` の値は[レイアウト](/ja/guides/layouts-and-components/)を参照してください。

## スピーカーノート

ノートは聴衆には表示されず、発表者ウィンドウ（`p`）とノートのオーバーレイ（`n`）に表示されます。スライドに合わせて、次のいずれかの方法で書けます。

- **`<SpeakerNotes>`** — `.mdx` のスライドで、Markdown をフルに使えます。

  ```mdx
  # My Slide

  Content here.

  <SpeakerNotes>
  Key points to mention:
  - **First** important thing
  - Second point with `code`
  </SpeakerNotes>
  ```

- **スライド末尾のコメント** — Slidev や Marp と同じ書き方です。`.md`、`.mdx`、`.html` のスライドで使え、Markdown も書けます。

  ```md
  # My Slide

  Content here.

  <!--
  Key points to mention:
  - **First** important thing
  -->
  ```

  ノートになるのは、スライドの*最後*にあるコメントだけです。それ以外の場所にあるコメントは、ふつうのコメントとして扱われます。なお `.mdx` では HTML コメントそのものが使えないので、ふつうのコメントには `{/* … */}` を使ってください。

- **frontmatter** — 短い一文なら `notes: "…"` で書けます。

1 枚のスライドに複数の書き方が含まれている場合は、`<SpeakerNotes>`、frontmatter の `notes`、末尾のコメントの順に優先されます。`<Notes>` も `<SpeakerNotes>` の別名として引き続き使えます。

:::note[ノートは公開サイトには載りません]
既定（`notes: "dev"`）では、ノートが入るのは `astro dev` で動かしているときと、`astlide export` が行うビルドだけです。PowerPoint に書き出すとノートも入りますが、`astro build` でビルドして公開したページには含まれません。公開したデッキの発表者ウィンドウには、ノートが公開されていないことが表示されます（`astlide export` も `dist/` にビルドするので、そのフォルダーを公開するときは `astro build` をやり直してください）。

公開したサイトからノートを見ながら発表したい場合は、すべてのページにノートを含めます。そうすると、デッキを開ける人なら誰でも（`n` キー、`?presenter`、ページのソースから）ノートを読めるようになります。

```ts
astlide({ notes: "public" })
```
:::

## ブラウザで編集する

`astro dev` の実行中にスライドで <kbd>e</kbd> を押すと、スライドの横にパネルが開いてソースファイルを直接編集できます。入力を止めて少し経つと（または <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>S</kbd> を押すとすぐに）変更が保存され、スライドが**ページを再読み込みせずにその場で**更新されます。変更した部分だけが差し替わるので、画面はちらつきません。カーソルの位置、フラグメントの現在のステップ、描画済みの図、カメラや録画の状態もそのまま残ります。<kbd>Esc</kbd>（または ✕）で保存してパネルを閉じます。

スピーカーノートの変更も同じように反映されます。frontmatter の `notes` でも `<Notes>` でも、ノートのオーバーレイと、同じスライドを表示しているほかのウィンドウ（発表者ウィンドウなど）がその場で更新されます。

スライドファイルの追加・削除・名前の変更もその場で反映されます。デッキを開いているすべてのウィンドウでスライド数とアウトラインが更新され、表示中のスライドとステップはそのまま保たれます（スライド番号は変わることがあります）。表示中のスライドのファイルが削除された場合は、その位置に来たスライドが表示されます。

パネルはスライドを移動しても開いたままで、各スライドのソースに切り替わります。

- 開発サーバー専用です。本番ビルドにはエディターもそのエンドポイントも含まれません。
- 編集できるのはスライドファイル（`src/` 以下の `.mdx`、`.md`、`.html`）だけです。読み書きできるのは、開発サーバーを動かしているマシン上で開いた、開発サーバー自身のページからだけです。デッキは `localhost`（または `127.0.0.1`）で開いてください。`astro dev --host` で起動した場合や、トンネル・リバースプロキシ（ngrok、cloudflared、ポートフォワーディングなど）を通した場合も、ほかの場所からスライドは見られます。ただし、そこからエディターで読み込んだり保存したりはできません。
- 編集内容は、入力したそばからファイルに保存されます。元に戻すときは、パネルの取り消し機能か Git などのバージョン管理を使ってください。

## 非表示のスライド

`hidden: true` を指定したスライドは、開発中は表示されますが本番ビルドではスキップされます。<kbd>←</kbd> / <kbd>→</kbd>、<kbd>Home</kbd> / <kbd>End</kbd>、ツールバー、発表者ウィンドウの次スライドのプレビュー、一覧表示、移動ダイアログのいずれでも飛ばされます。直接リンクを開いた場合は、次に表示されるスライドへリダイレクトされます。
