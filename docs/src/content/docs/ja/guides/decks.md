---
title: デッキを作成する
description: デッキのフォルダー構成、_config.json、.mdx・.md・.html のスライドファイル、frontmatter の書き方です。
---

デッキは `src/content/decks/` の下に置くフォルダーです。スライドはファイル名に番号を付けて置き、ファイル名順に並びます。

## CLI で雛形を作る

```bash
bunx create-astlide deck my-talk --theme dark --format mdx   # or md | html
```

## 手で作る

1. `src/content/decks/my-talk/_config.json` を作ります。

   ```json
   {
     "title": "My Talk",
     "author": "Your Name",
     "date": "2025-01-15",
     "theme": "default"
   }
   ```

2. スライドを、番号付きのファイル名で追加します。`.mdx`、`.md`、`.html` は混ぜて使えます。

   ```
   src/content/decks/my-talk/
   ├── _config.json
   ├── 01-cover.mdx
   ├── 02-intro.md
   └── 03-demo.html
   ```

URL のスライド番号（`/my-talk/2`）は、ファイル名で並べたときの順番です。

## スライドの形式

- **`.mdx`** — Markdown にコンポーネント（`<Fragment>`、`<Columns>`、`<SpeakerNotes>` など）を混ぜて書けます。Astlide のコンポーネントは import しなくても使えます。
- **`.md`** — 普通の Markdown です。コードのハイライトや図も使えます。
- **`.html`** — 1 ファイルで完結する HTML のスライドです。body の中身は手を加えずにそのまま描画され、インラインの `<style>` やマークアップも残ります。信頼の扱いは MDX と同じです。手で書いた HTML や AI に生成させた HTML を貼り付けるときに便利です。

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
レイアウトの指定には **`slideLayout`** を使います。`layout` は Astro の MDX パイプラインが予約しているので使えません。
:::

フィールドの一覧は [frontmatter リファレンス](/ja/reference/frontmatter/)に、組み込みの `slideLayout` の値は[レイアウト](/ja/guides/layouts-and-components/)のページにあります。

## 発表者ノート

発表者ノートは聴衆には見えません。発表者ウィンドウ（`p`）とノートのオーバーレイ（`n`）に表示されます。書き方は 3 通りあるので、スライドに合わせて選んでください。

- **`<SpeakerNotes>`** — `.mdx` のスライドで使います。Markdown の記法がすべて使えます。

  ```mdx
  # My Slide

  Content here.

  <SpeakerNotes>
  Key points to mention:
  - **First** important thing
  - Second point with `code`
  </SpeakerNotes>
  ```

- **スライド末尾のコメント** — Slidev や Marp と同じ書き方です。`.md`、`.mdx`、`.html` のどのスライドでも使え、中に Markdown も書けます。

  ```md
  # My Slide

  Content here.

  <!--
  Key points to mention:
  - **First** important thing
  -->
  ```

  ノートになるのは、スライドの*最後*に置いたコメントだけです。ほかの場所のコメントは、ただのコメントのままです。なお、`.mdx` ではこれ以外の場所に HTML コメントを書けません。普通のコメントには `{/* … */}` を使ってください。

- **frontmatter** — 1 行で済むなら `notes: "…"` と書けます。

1 枚のスライドに複数の書き方が混ざっている場合は、`<SpeakerNotes>`、frontmatter の `notes`、末尾のコメントの順に優先します。`<Notes>` も、これまでどおり `<SpeakerNotes>` の別名として使えます。

:::note[ノートは公開サイトに載りません]
既定の設定（`notes: "dev"`）では、ノートが入るのは `astro dev` での表示と、`astlide export` が行うビルドだけです。そのため PowerPoint に書き出したファイルにはノートが残りますが、`astro build` でビルドしてデプロイしたページには入りません。デプロイしたデッキの発表者ウィンドウには、ノートが公開されていない旨が表示されます。`astlide export` は専用のフォルダー（`node_modules/.astro/astlide-export`）にビルドするので、`dist/` にノートが入ることはありません。

デプロイしたサイトでノートを見ながら発表したいときは、すべてのページにノートを含めます。ただしこうすると、デッキを開ける人なら誰でもノートを読めます（`n` キー、`?presenter`、ページのソースから）。

```ts
astlide({ notes: "public" })
```
:::

## ブラウザで編集する

編集を使うには、ブラウザごとに一度だけ有効化が必要です。`astro dev` を起動すると、次のようなリンクが表示されます。

```
[astlide] Slide editor: open http://localhost:4321/__astlide/editor?code=… in your browser to enable editing (works once, for 30 minutes)
```

このリンクを、編集に使うブラウザで開いてください。リンクのコードは一度しか使えず、30 分で期限が切れます。`astro dev` を起動するたびに新しいリンクが出ます。一度有効にしたブラウザは、このプロジェクトとポートの組み合わせについて、開発サーバーを再起動しても有効なままです。この仕組みには Cookie を使っており、Cookie の値は `node_modules/.astro/astlide-editor-secret` に保存した秘密の値から作ります。このファイルを消すと、すべてのブラウザで編集が無効になります。有効にするまで、パネルには編集が無効だと表示されます。

`astro dev` の実行中にスライドで <kbd>e</kbd> を押すと、スライドの横にパネルが開き、そのスライドのソースファイルを直接編集できます。入力を止めて少しすると変更が保存されます（<kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>S</kbd> ならすぐに保存）。スライドは**ページを再読み込みせずにその場で**更新されます。変更した部分だけを差し替えるので、画面はちらつきません。カーソルの位置、段階表示の現在のステップ、描画済みの図、カメラや録画中の状態もそのまま残ります。<kbd>Esc</kbd>（または ✕）を押すと、保存してパネルを閉じます。

発表者ノートの変更も、frontmatter の `notes` か `<Notes>` かを問わず同じように反映されます。ノートのオーバーレイと、同じスライドを表示しているほかのウィンドウ（発表者ウィンドウなど）がその場で更新されます。

スライドファイルの追加・削除・名前の変更もその場で反映されます。デッキを開いているウィンドウはすべて、スライド数とアウトラインを更新します。表示中のスライドとステップはそのままです（スライド番号は変わることがあります）。表示中のスライドのファイルを消した場合は、その位置に繰り上がったスライドを表示します。

パネルはスライドを移動しても開いたままで、移動先のスライドのソースに切り替わります。

- 開発サーバーでしか使えません。本番ビルドには、エディターもそのエンドポイントも入りません。
- 編集できるのは、`src/content/decks/` にすでにあるスライドファイル（`.mdx`、`.md`、`.html`）だけです。新しいファイルは作りません。また、開発サーバーを動かしているマシン上で、開発サーバー自身のページを開いたときしか使えません。デッキは `localhost`（または `127.0.0.1`）で開いてください。`astro dev --host` で起動したり、トンネルやリバースプロキシ（ngrok、cloudflared、ポートフォワーディング）を通したりすれば、ほかの場所からもスライドは見られます。ただし、そこではエディターの読み込みも保存もできません。保存するには、表示されたリンクで有効にしたブラウザであることも必要です。リンクはターミナルにしか出ないので、生のポート転送（`ssh -R`）のように開発サーバーからはローカルのブラウザに見える経路でも、保存はできません。このリンクは人に教えないでください。
- Markdown・HTML・PowerPoint のスライドに含まれるスクリプト（`<script>`、`onclick` などの属性、`javascript:` のリンク）は、スライドを描画するときに取り除きます。`astro dev` でも同じです。他人が作ったスライドを開いても、そのスライドがブラウザ上でエディターなどを勝手に操作することはできません。MDX のスライドのスクリプトは残ります。[`slideScripts: true`](/ja/reference/configuration/) は、中身を完全に信頼できるデッキにだけ設定してください。
- 編集内容は、入力するそばからファイルに書き込まれます。元に戻すには、パネルの取り消し機能かバージョン管理を使ってください。

## 非表示のスライド

`hidden: true` を付けたスライドは、開発中は表示されますが、本番ビルドでは飛ばされます。<kbd>←</kbd> / <kbd>→</kbd>、<kbd>Home</kbd> / <kbd>End</kbd>、ツールバー、発表者ウィンドウの次スライドのプレビュー、一覧、スライド移動のダイアログのどれを使っても表示されません。直接リンクで開いた場合は、次の表示されるスライドへリダイレクトします。
