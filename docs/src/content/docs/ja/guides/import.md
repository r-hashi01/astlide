---
title: PowerPoint と Google スライドの取り込み
description: .pptx をそのまま Astlide のスライドとして表示する方法と、編集できるデッキに変換する方法です。
---

Astlide は PowerPoint のファイルを読み込めます。各ページが Astlide のスライドになり、テキストはテキストのまま残ります。図形・画像・表も元の位置に配置します。プレースホルダーの位置と文字スタイルはスライドレイアウトとスライドマスターから取り、テーマの色とフォントも反映します。発表者ノート、タイトル、非表示スライドの設定も引き継ぎます。

Google スライドと Keynote のファイルは、PowerPoint 形式で書き出せば読み込めます。テンプレートのデザインを使って新しいスライドを Markdown で書きたい場合は、[PowerPoint テンプレート](/ja/guides/templates/)を参照してください。

## .pptx をそのまま表示する

ファイルを、ほかのスライドと同じデッキのフォルダーに置きます。

```
src/content/decks/q3-review/
├── _config.json
├── 01-intro.md
├── 02-numbers.pptx      ← every page of it, in place
└── 03-next-steps.mdx
```

`.pptx` の各ページは、ほかのファイルとまとめてファイル名順に並びます（`02-numbers.pptx` → `02-numbers--001`、`02-numbers--002` …）。発表者ウィンドウ、一覧、ノート、PDF / PPTX のエクスポートも、普通のスライドと同じく使えます。`.pptx` を編集して保存すれば、デッキにも反映されます。ファイルに埋め込まれた画像とフォントは、Astlide が `/_astlide/pptx/` から配信します。

## 編集できるデッキに取り込む

```bash
bunx astlide import ~/Downloads/kickoff.pptx --deck kickoff
```

1 ページにつき 1 つの `.html` スライドが `src/content/decks/kickoff/` にできます。タイトル、ノート、`hidden` は frontmatter に入り、図形は 1 行に 1 つずつ書かれます。画像は `public/pptx/kickoff/` に保存され、`_config.json` も作られます。これ以降、スライドはただのファイルです。中身を編集しても、Markdown のスライドを混ぜても、テーマを変えてもかまいません。

| オプション | |
|---|---|
| `--deck <name>` | デッキのフォルダー名（省略時はファイル名から決めます） |
| `--force` | 同じ名前のデッキフォルダーがあれば置き換えます |
| `--cwd <dir>` | プロジェクトのルート（省略時はカレントディレクトリから探します） |

### Google スライド

デッキの URL を渡せば、PowerPoint 形式でダウンロードして取り込みます。ただし、デッキの共有設定が「リンクを知っている全員」になっている必要があります。そうでなければ、Google スライドの「ファイル → ダウンロード → Microsoft PowerPoint」でダウンロードし、そのファイルを取り込んでください。

```bash
bunx astlide import https://docs.google.com/presentation/d/1AbC…/edit
```

## コードから使う

```ts
import { pptxToSlides } from "@astlide/core/pptx";

const deck = pptxToSlides(await readFile("talk.pptx"), {
  // Where pictures and embedded fonts go (default: pictures inlined as data: URLs).
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

グラフ、SmartArt、埋め込みオブジェクトは、目印を付けた枠として表示します。EMF / WMF の画像はブラウザで表示できないため、輪郭だけを表示します。これらは画像として挿入し直してください。16:9 以外のスライドは、上下または左右に余白を付けて表示します。
