---
title: PowerPoint と Google スライドの取り込み
description: .pptx をそのまま Astlide のスライドとして表示する方法と、編集できるデッキに変換する方法です。
---

Astlide で PowerPoint のファイル（`.pptx`）を使う方法は 2 つあります。1 つは、`.pptx` をデッキのフォルダーに置いて、そのまま表示する方法です。もう 1 つは、一度だけ `.html` のスライドに変換し、以降はそのファイルを編集していく方法です。

どちらの方法でも、PowerPoint の 1 ページが Astlide のスライド 1 枚になります。テキストは画像にならず、テキストのまま残ります。図形・画像・表は元の位置に配置されます。プレースホルダーの位置と文字のスタイルは、スライドレイアウトとスライドマスターから取ります。テーマの色とフォントも反映され、発表者ノート、スライドのタイトル、非表示スライドの設定も引き継がれます。

読み込めるのは `.pptx` だけです。Google スライド、Keynote、`.ppt`、`.odp` のファイルは、先に PowerPoint 形式で保存するかダウンロードしてください。Google スライドは URL から直接取り込むこともできます（[後述](#google-スライド)）。PowerPoint のデザインを使って新しいスライドを Markdown で書きたい場合は、[PowerPoint テンプレート](/ja/guides/templates/)を参照してください。

:::note
どちらの方法でも、`decks` コレクションのローダーが `astlideDeckLoader()` になっている必要があります（[はじめに](/ja/getting-started/#既存の-astro-プロジェクトに追加する)を参照）。`bun create astlide` で作ったプロジェクトは、最初からそうなっています。ただし、古いバージョンの `create-astlide` で作ったプロジェクトは `.mdx` のファイルしか読み込まないので、書き換えてください。
:::

## .pptx をそのまま表示する

`.pptx` を、ほかのスライドと同じデッキのフォルダーに置きます。

```
src/content/decks/q3-review/
├── _config.json
├── 01-intro.md
├── 02-numbers.pptx      ← every page of it, in place
└── 03-next-steps.mdx
```

ファイルの各ページは、ファイル名に連番を付けた名前のスライドになります。この例では `02-numbers--001`、`02-numbers--002` と続きます。並び順はほかのスライドとまとめてファイル名で決まるので、`01-intro.md` の後、`03-next-steps.mdx` の前に入ります。

こうして表示したスライドも、発表者ウィンドウ、一覧、発表者ノート、PDF / PPTX のエクスポートでほかのスライドと同じように扱えます。`.pptx` を編集して保存すると、デッキにも反映されます。ファイルに埋め込まれた画像とフォントは、Astlide が `/_astlide/pptx/` から配信します。

## 編集できるデッキに取り込む

```bash
bunx astlide import ~/Downloads/kickoff.pptx --deck kickoff
```

このコマンドを実行すると、次のファイルが作られます。

- `src/content/decks/kickoff/`: 1 ページにつき 1 つの `.html` スライドと `_config.json`。スライドのタイトル、ノート、`hidden` は frontmatter に入り、本文には図形が 1 行に 1 つずつ書かれます。
- `public/pptx/kickoff/`: 画像

取り込んだあとのスライドは、普通のファイルとして扱えます。中身を編集しても、同じデッキに Markdown のスライドを加えても、テーマを変えてもかまいません。

| オプション | |
|---|---|
| `--deck <name>` | デッキのフォルダー名（省略時はファイル名から決めます） |
| `--force` | 同じ名前のデッキのフォルダーと画像があれば、置き換えます |
| `--cwd <dir>` | プロジェクトのルート（省略時は、カレントディレクトリから上にたどって最初に `src/content/decks` があるフォルダー） |

### Google スライド

ファイルの代わりにデッキの URL を渡すと、Astlide が PowerPoint 形式でダウンロードして取り込みます。

```bash
bunx astlide import https://docs.google.com/presentation/d/1AbC…/edit
```

URL から取り込めるのは、共有設定が「リンクを知っている全員」になっているデッキだけです。非公開のデッキは、Google スライドの **ファイル → ダウンロード → Microsoft PowerPoint (.pptx)** でダウンロードし、そのファイルを取り込んでください。

## コードから使う

```ts
import { readFile } from "node:fs/promises";
import { pptxToSlides } from "@astlide/core/pptx";

const deck = pptxToSlides(await readFile("talk.pptx"), {
  // Where pictures and embedded fonts go: return a URL, or null to leave the file out.
  // Default: pictures inlined as data: URLs, embedded fonts left out.
  media: ({ name, data, type }) => saveSomewhere(name, data, type),
});
deck.slides[0].html;   // an Astlide .html slide body (1920×1080)
deck.slides[0].notes;  // speaker notes
deck.theme;            // the master's theme colors and fonts
```

## 変換できるもの

| PowerPoint | Astlide |
|---|---|
| テキストボックスとプレースホルダー: フォント、サイズ、色、太字 / 斜体 / 下線、配置、箇条書きと番号付け、間隔、リンク | 位置を指定したテキスト |
| 四角形、角丸四角形、楕円、矢印、吹き出し、よく使われるプリセット図形、フリーフォーム | CSS のボックスと SVG |
| 単色・グラデーション・画像・タイル・パターンの塗りつぶし、枠線、破線、矢じり | CSS / SVG |
| 画像（PNG、JPEG、GIF、SVG）、トリミング | `<img>` |
| 表: セルの塗りつぶし、罫線、結合セル | `<table>` |
| グループ化、回転、反転 | transform |
| 背景（スライド、レイアウト、マスター）、マスターとレイアウトの装飾 | スライドのキャンバス |
| 埋め込みフォント | `@font-face` |

変換できないものもあります。グラフ、SmartArt、埋め込みオブジェクトは、「Chart」「SmartArt」「Object」と書かれた点線の枠になります。EMF や WMF のようにブラウザで表示できない形式の画像は、中身のない点線の枠になります。これらを残したい場合は、PowerPoint 側で PNG や SVG の画像に差し替えてください。16:9 以外のスライドは、上下か左右に余白を付けて表示します。
