---
title: PowerPoint と Google スライドの取り込み
description: .pptx をそのまま Astlide のスライドとして表示したり、編集可能なデッキに変換したりします。
---

Astlide は PowerPoint ファイルを読み込めます。各ページが Astlide のスライドになり、テキストはテキストのまま、図形・画像・表は元の位置に配置されます。プレースホルダーの位置と文字スタイルはスライドレイアウトとスライドマスターから取得し、テーマの色とフォントも解決します。スピーカーノート、タイトル、非表示スライドも引き継がれます。

Google スライドと Keynote は、PowerPoint 形式で書き出せば使えます。テンプレートのデザインで新しいスライドを Markdown で書きたい場合は、[PowerPoint テンプレート](/ja/guides/templates/)を参照してください。

## .pptx をそのまま表示する

ファイルをデッキのフォルダに、ほかのスライドと並べて置きます。

```
src/content/decks/q3-review/
├── _config.json
├── 01-intro.md
├── 02-numbers.pptx      ← every page of it, in place
└── 03-next-steps.mdx
```

各ページはほかのファイルと一緒にファイル名順に並び（`02-numbers.pptx` → `02-numbers--001`、`02-numbers--002` …）、発表者ウィンドウ、一覧表示、ノート、PDF / PPTX エクスポートもほかのスライドと同じように使えます。`.pptx` を編集して保存すると、デッキにも反映されます。ファイルに埋め込まれた画像とフォントは Astlide が（`/_astlide/pptx/` から）配信します。

## 編集可能なデッキに取り込む

```bash
bunx astlide import ~/Downloads/kickoff.pptx --deck kickoff
```

このコマンドは、ページごとに 1 つの `.html` スライドを `src/content/decks/kickoff/` に書き出します。タイトル、ノート、`hidden` は frontmatter に入り、図形は 1 行に 1 つずつ並びます。画像は `public/pptx/kickoff/` に書き出され、`_config.json` も作られます。あとはふつうのファイルなので、編集しても、Markdown のスライドを混ぜても、テーマを変えてもかまいません。

| オプション | |
|---|---|
| `--deck <name>` | デッキのフォルダ名（デフォルト: ファイル名から決定） |
| `--force` | 既存のデッキフォルダを置き換える |
| `--cwd <dir>` | プロジェクトのルート（デフォルト: カレントディレクトリから探索） |

### Google スライド

デッキの URL を渡します。PowerPoint 形式でダウンロードされるので、デッキが「リンクを知っている全員」に共有されている必要があります。そうでない場合は、Google スライドの「ファイル → ダウンロード → Microsoft PowerPoint」でダウンロードしてから、そのファイルを取り込んでください。

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

## 変換される内容

| PowerPoint 側 | Astlide 側 |
|---|---|
| テキストボックスとプレースホルダー: フォント、サイズ、色、太字 / 斜体 / 下線、配置、箇条書きと番号付け、間隔、リンク | 位置指定したテキスト |
| 四角形、角丸四角形、楕円、矢印、吹き出し、よく使われるプリセット図形、フリーフォーム | CSS のボックスと SVG |
| 単色・グラデーション・画像・タイル・パターンの塗りつぶし、枠線、破線、矢じり | CSS / SVG |
| 画像（PNG、JPEG、GIF、SVG）、トリミング | `<img>` |
| 表: セルの塗りつぶし、罫線、結合セル | `<table>` |
| グループ、回転、反転 | transform |
| 背景（スライド、レイアウト、マスター）、マスターとレイアウトの装飾 | スライドのキャンバス |
| 埋め込みフォント | `@font-face` |

グラフ、SmartArt、埋め込みオブジェクトは目印付きの枠として表示され、EMF / WMF 画像（ブラウザでは表示できません）は輪郭だけが表示されます。これらは画像として挿入し直してください。16:9 以外のスライドは上下または左右に余白を付けて表示されます。
