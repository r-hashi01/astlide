---
title: デッキを作成する
description: デッキのフォルダーと _config.json の作り方、.mdx・.md・.html でのスライドの書き方、frontmatter、発表者ノート、ブラウザでの編集、スライドの非表示を説明します。
---

デッキは `src/content/decks/` の下に作るフォルダーです。中には `_config.json` と、スライド 1 枚につき 1 つのファイルを置きます。フォルダー名はそのまま URL になり、`src/content/decks/my-talk/` のデッキは `/my-talk/` で開けます。

## CLI で雛形を作る

プロジェクトのルートフォルダーで次のコマンドを実行します。

```bash
bunx create-astlide deck my-talk --theme dark --format mdx   # or md | html
```

`src/content/decks/my-talk/` ができ、`_config.json` とサンプルのスライド 3 枚が入ります。`--format` を省くと、どの形式にするかを対話形式で聞かれます。

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

   項目はすべて省略できます。`title` を省くとフォルダー名が使われます。`theme` の既定値は `default` です。ほかのテーマは「[テーマとプラグイン](/ja/guides/themes-and-plugins/)」を参照してください。

2. スライドのファイルを、先頭に番号を付けた名前で置きます。1 つのデッキの中で `.mdx`、`.md`、`.html` を混ぜても構いません。

   ```
   src/content/decks/my-talk/
   ├── _config.json
   ├── 01-cover.mdx
   ├── 02-intro.md
   └── 03-demo.html
   ```

スライドはファイル名の順に並び、URL のスライド番号（`/my-talk/2`）もこの順番で決まります。ファイル名は文字列として比較するので、番号の桁数はそろえてください。`02` なら `10` より前に来ますが、`2` だと `10` より後ろになります。

デッキのフォルダーには `.pptx` ファイルも置けます。置いた `.pptx` は、そのままスライドとして表示されます。詳しくは「[PowerPoint と Google スライドの取り込み](/ja/guides/import/)」を参照してください。

## スライドの形式

- **`.mdx`**: Markdown の中に `<Fragment>`、`<Columns>`、`<SpeakerNotes>` などのコンポーネントを書けます。Astlide のコンポーネントは import せずに使えます。
- **`.md`**: 普通の Markdown です。コードのハイライトや図も使えます。
- **`.html`**: 1 枚のスライドを HTML で書きます。body の中身は、インラインの `<style>` も含めて手を加えずに描画します。信頼の度合いは MDX のスライドと同じ扱いです。手書きの HTML や、AI ツールが生成した HTML を貼り付けたいときに便利です。

`.html` のスライドにも、ほかの形式と同じ frontmatter を書けます。

```html
---
slideLayout: cover
background: "#0b132b"
---
<style>.hero { font-size: 3rem; }</style>
<h1 class="hero">Everything in one HTML file</h1>
```

## frontmatter

スライドごとの設定は、ファイルの先頭に frontmatter で書きます。

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
レイアウトは **`slideLayout`** で指定します。`layout` というキーは Astro の MDX パイプラインが予約しているため使えません。
:::

使える項目の一覧は [frontmatter リファレンス](/ja/reference/frontmatter/)にあります。`slideLayout` に指定できる組み込みの値は[レイアウト](/ja/guides/layouts-and-components/)のページを見てください。

## 発表者ノート

発表者ノートは聴衆には表示されません。発表者ウィンドウ（`p`）とノートのオーバーレイ（`n`）でだけ見えます。書き方は次の 3 通りです。

- **`<SpeakerNotes>` で書く**: `.mdx` のスライドで使えます。中には Markdown を自由に書けます。

  ```mdx
  # My Slide

  Content here.

  <SpeakerNotes>
  Key points to mention:
  - **First** important thing
  - Second point with `code`
  </SpeakerNotes>
  ```

- **スライドの末尾に HTML コメントで書く**: Slidev や Marp と同じ書き方です。`.md`、`.mdx`、`.html` のどれでも使え、コメントの中に Markdown も書けます。

  ```md
  # My Slide

  Content here.

  <!--
  Key points to mention:
  - **First** important thing
  -->
  ```

  ノートになるのは、スライドの*最後*にあるコメントだけです。それ以外の場所のコメントは、普通のコメントとして扱います。なお `.mdx` で書ける HTML コメントは、この末尾のコメントだけです。ほかの場所にコメントを書くときは `{/* … */}` を使ってください。

- **frontmatter の `notes: "…"` で書く**: 1 行で済む短いノート向けです。

1 枚のスライドで複数の書き方を使った場合は、`<SpeakerNotes>`、frontmatter の `notes`、末尾のコメントの順に優先します。以前の名前の `<Notes>` も、`<SpeakerNotes>` と同じように使えます。

:::note[ノートは公開サイトには含まれません]
既定の設定（`notes: "dev"`）でノートが入るのは、`astro dev` で表示したページと、`astlide export` が行うビルドの 2 つです。そのため、PowerPoint に書き出したファイルにはノートが残ります。一方、`astro build` でビルドしてデプロイしたページにはノートが入りません。デプロイしたデッキの発表者ウィンドウには、ノートが公開されていないことが表示されます。`astlide export` は専用のフォルダー（`node_modules/.astro/astlide-export`）でビルドするので、`dist/` にノートが紛れ込むこともありません。

デプロイしたサイトでもノートを見ながら発表したい場合は、すべてのページにノートを含める設定にします。

```ts
astlide({ notes: "public" })
```

この設定にすると、デッキを開ける人は誰でもノートを読めるようになります。`n` キー、`?presenter`、ページのソースのどれからでも見えます。
:::

## ブラウザで編集する

`astro dev` の実行中は、スライドを表示したまま、その横でソースファイルを編集できます。

### ブラウザで編集を有効にする

編集を使うには、ブラウザごとに一度だけ有効化の手順が必要です。`astro dev` を起動すると、次のようなリンクが出力されます。

```
[astlide] Slide editor: open http://localhost:4321/__astlide/editor?code=… in your browser to enable editing (works once, for 30 minutes)
```

このリンクを、編集に使うブラウザで開いてください。リンク内のコードは一度しか使えず、30 分で期限が切れます。`astro dev` を起動するたびに新しいリンクが出力されます。このリンクは他人に教えないでください。

一度有効にしたブラウザは、同じプロジェクトとポートであれば、開発サーバーを再起動しても有効なままです。有効化の状態は Cookie で保持しています。Cookie の値は、`node_modules/.astro/astlide-editor-secret` に保存した秘密の値から作ります。このファイルを削除すると、すべてのブラウザで編集が無効になります。有効にしていないブラウザでは、パネルに編集が無効だと表示されます。

### スライドを編集する

スライドを表示した状態で <kbd>e</kbd> を押すと、横にパネルが開いてスライドのソースファイルが表示されます。そのまま入力して編集できます。

- 入力を止めて少し経つと、自動で保存します。すぐに保存したいときは <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>S</kbd> を押します。
- スライドはページを再読み込みせずに更新されます。変更した部分だけを差し替えるので、画面はちらつきません。カーソルの位置、[段階表示](/ja/guides/fragments/)の現在のステップ、描画済みの図、カメラや録画中の状態もそのまま残ります。
- 発表者ノートも同じように更新されます。frontmatter の `notes` でも `<Notes>` でも同じです。ノートのオーバーレイや、同じスライドを表示しているほかのウィンドウ（発表者ウィンドウなど）も、その場で更新されます。
- 別のスライドに移動してもパネルは開いたままで、移動先のスライドのファイルに切り替わります。
- <kbd>Esc</kbd> を押すか ✕ をクリックすると、保存してからパネルを閉じます。

スライドファイルの追加・削除・名前の変更も、すぐに反映されます。デッキを開いているウィンドウはすべて、スライド数とアウトラインを更新します。表示中のスライドとステップはそのまま保ちますが、スライド番号は変わることがあります。表示中のスライドのファイルを削除した場合は、その番号に繰り上がったスライドを表示します。

### 使える条件と注意点

- エディターは開発サーバーでしか動きません。本番ビルドには、エディターもそのエンドポイントも含まれません。
- 編集できるのは、`src/content/decks/` にすでにあるスライドファイル（`.mdx`、`.md`、`.html`）だけです。ファイルの新規作成や、それ以外のファイルの編集はできません。
- 編集できるのは、開発サーバーを動かしているマシンで、デッキを `localhost` か `127.0.0.1` で開いたときだけです。`astro dev --host` で起動した場合や、ngrok・cloudflared・ポートフォワーディングなどのトンネルやリバースプロキシを経由した場合、ほかの端末からスライドを見ることはできます。ただし、そこではエディターの読み込みも保存もできません。
- 保存するには、出力されたリンクで有効にしたブラウザである必要もあります。リンクはターミナルにしか出ません。そのため、生のポート転送（`ssh -R`）のように開発サーバーからはローカルのブラウザに見える経路でも、リンクなしでは何も保存できません。
- Markdown・HTML・PowerPoint のスライドに含まれるスクリプト（`<script>`、`onclick` などの属性、`javascript:` のリンク）は、描画時に取り除きます。`astro dev` でも同じです。他人が書いたスライドが、あなたのブラウザでエディターなどを操作することはできません。MDX のスライドのスクリプトは残ります。[`slideScripts: true`](/ja/reference/configuration/) は、内容を完全に信頼できるデッキにだけ設定してください。
- 編集内容は、入力したそばからファイルに書き込まれます。元に戻すには、パネルの取り消し操作かバージョン管理を使ってください。

## スライドを非表示にする

ファイルは残したまま、公開するデッキからスライドを外したいときは、frontmatter に `hidden: true` を書きます。

- `astro dev` では、普段どおり表示します。
- 本番ビルドでは、どの移動方法でも飛ばします。<kbd>←</kbd> / <kbd>→</kbd>、<kbd>Home</kbd> / <kbd>End</kbd>、ツールバー、発表者ウィンドウの次スライドのプレビュー、一覧、スライド移動のダイアログのすべてが対象です。このスライドへの直接リンクは、次に表示されるスライドへリダイレクトします。
- 印刷用ビュー（`/<deck>/all`）と、PDF・PowerPoint へのエクスポートには、開発中でも含めません。
