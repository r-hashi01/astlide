---
title: コーディングエージェント
description: Claude Code、Codex、Gemini CLI にデッキを書かせ、チェックし、エクスポートさせます。MCP サーバー、エージェントスキル、llms.txt を紹介します。
---

コーディングエージェントは、ほかのファイルと同じように Astlide のデッキも書けます。うまく書かせるために、次の 3 つを用意しています。

- **MCP サーバー**: PowerPoint テンプレートの読み取り、`.pptx` ファイルのインポート、収まらないテキストの検出、デッキのエクスポートを行うツールを提供します。
- **エージェントスキル**: スライドの書き方、レイアウト、そして「書く → チェックする → 直す → エクスポートする」の流れを教えます。
- **プレーンテキストのドキュメント**: [`/astlide/llms.txt`](https://r-hashi01.github.io/astlide/llms.txt) と [`/astlide/llms-full.txt`](https://r-hashi01.github.io/astlide/llms-full.txt) にあります。

## MCP サーバー

サーバーは `@astlide/core` に含まれています。`astlide mcp` で起動し、標準入出力（stdio）で MCP のやり取りをします（[Bun](https://bun.sh) で動きます）。Astlide を入れたプロジェクトなら、追加のインストールは要りません。

ツールを呼ぶたびに対象の Astlide プロジェクトを指定し、そのプロジェクトにインストールされている `@astlide/core` を使って動きます。

### ツール

| ツール | 引数 | 戻り値 |
|---|---|---|
| `template_layouts` | `templatePath`（`.pptx` / `.potx` / `.thmx`） | テンプレートのレイアウト（`slideLayout` に使う ID、PowerPoint での名前と種類、タイトル / 本文 / スライド番号のプレースホルダー、各レイアウトで描画される組み込みレイアウト（`cover`、`section`、`default`、`two-column`、`code`））と、テーマの色とフォント |
| `import_pptx` | `path`、省略可能な `projectRoot`、`deck`、`force`、`includeHtml` | 各スライドのタイトル、スピーカーノート、Markdown にしたテキスト。`projectRoot` を指定すると、[`astlide import`](/astlide/ja/guides/import/) と同じように編集可能なデッキも書き出します |
| `check_deck` | `projectRoot`、`deck`、省略可能な `build` | スライドごとの、収まっていないテキストやボックス（後述） |
| `render_deck` | `projectRoot`、`deck`、`formats`（`pptx`、`pdf`）、省略可能な `outDir`、`build` | [`astlide export`](/astlide/ja/guides/export/) と同じように書き出したファイルのパス |

`check_deck` と `render_deck` はサイトを自分でビルドするので（`check_deck` は `dist/` がデッキより古い場合のみ）、開発サーバーは不要です。PDF のエクスポートには Playwright の Chromium（`bunx playwright install chromium`）が必要です。

### Claude Code

```bash
claude mcp add astlide -- bunx astlide mcp
```

`--scope project` を付けると、`.mcp.json` を通じてチームで共有できます。

### Codex

```toml
# ~/.codex/config.toml
[mcp_servers.astlide]
command = "bunx"
args = ["astlide", "mcp"]
```

### Gemini CLI

```json
// ~/.gemini/settings.json (or .gemini/settings.json in the project)
{
  "mcpServers": {
    "astlide": {
      "command": "bunx",
      "args": ["astlide", "mcp"]
    }
  }
}
```

ほかの MCP クライアントでも、プロジェクトのフォルダで `bunx astlide mcp` を起動するように設定します。

## デッキをチェックする

`check_deck` は、[PowerPoint エクスポート](/astlide/ja/guides/export/)を支えるエンジンでデッキをレイアウトし（1920×1080、テーマのフォントを使用、ブラウザは使いません）、スライドごとに次の問題を報告します。

| 種類 | 意味 |
|---|---|
| `text-clipped` | スライドや `overflow: hidden` のボックスでテキストが切れていて、一部が見えない |
| `text-overflow` | テキストがボックス（高さ固定のカード、カラム、スライドのコンテンツ領域）からはみ出している |
| `box-clipped` / `box-overflow` | 画像、表、埋め込みについての同様の問題 |
| `off-slide` | 何にも切り取られず、スライドの外に出ている |

各問題には、スライド番号とタイトル、テキスト、その要素とはみ出している相手、どちら側に何 px はみ出しているかが含まれます。

```text
2 problem(s) in 2 of 12 slides:
- Slide 4 "Results": 5 text blocks, "Churn fell to 2%" to "Next: EMEA", are cut off by the slide (186px bottom)
- Slide 9 "Pricing": text "Enterprise plans include single sign-on, audit logs and…" (p) is cut off by div.card (48px bottom)
```

これをもとに、エージェントはテキストを短くしたり、スライドを分けたり、別のレイアウトを選んだりして、もう一度チェックできます。

テキストは、デッキが読み込むフォント（`@font-face` のルールと Google Fonts）で計測されます。フォントが見つからない場合は結果にその旨が示され、幅は概算になります。Mermaid の図（ブラウザでレイアウトされるため）と、そのまま表示している `.pptx` ファイルのページはチェックの対象外です。

## エージェントスキル

[`skills/astlide/SKILL.md`](https://github.com/r-hashi01/astlide/tree/main/skills/astlide) は [Agent Skill](https://agentskills.io) です。デッキの構成、frontmatter、レイアウト、コンポーネント、PowerPoint テンプレート、エクスポート、チェックの流れ、よくある間違い（`layout` ではなく `slideLayout` を使う、など）をまとめています。

- **Claude Code**: プロジェクトの `.claude/skills/astlide/` にフォルダをコピーします（すべてのプロジェクトで使う場合は `~/.claude/skills/astlide/`）。

  ```bash
  mkdir -p .claude/skills && cp -r /path/to/astlide/skills/astlide .claude/skills/
  ```

- **そのほかのエージェント**: Agent Skills を読み込めるエージェントなら、スキルのディレクトリから同じフォルダを読み込めます。それ以外のエージェントには、指示ファイル（`AGENTS.md`、`GEMINI.md`）からこのファイルを参照させてください。

## llms.txt

ドキュメントは言語モデル向けにも公開しています。

- [`https://r-hashi01.github.io/astlide/llms.txt`](https://r-hashi01.github.io/astlide/llms.txt) — 全ページの一覧と 1 行の要約（[llms.txt 形式](https://llmstxt.org)）
- [`https://r-hashi01.github.io/astlide/llms-full.txt`](https://r-hashi01.github.io/astlide/llms-full.txt) — 全ページを 1 つにまとめた Markdown

Astlide のすべてを一度に把握させたいときは、エージェントに後者を渡してください。
