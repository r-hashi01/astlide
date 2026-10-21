---
title: コーディングエージェント
description: Claude Code、Codex、Gemini CLI にデッキを書かせ、チェックし、エクスポートさせます。MCP サーバー、エージェントスキル、llms.txt を紹介します。
---

コーディングエージェントは、ほかのファイルと同じように Astlide のデッキも書けます。うまく書かせるために、次の 3 つを用意しています。

- **MCP サーバー**: PowerPoint テンプレートの読み取り、`.pptx` ファイルのインポート、収まらないテキストの検出、デッキのエクスポートを行うツールを提供します。
- **エージェントスキル**: スライドの書き方、レイアウト、そして「書く → チェックする → 直す → エクスポートする」の流れを教えます。
- **プレーンテキストのドキュメント**: [`/llms.txt`](https://astlide.dev/llms.txt) と [`/llms-full.txt`](https://astlide.dev/llms-full.txt) にあります。

## MCP サーバー

サーバーは `@astlide/core` に含まれています。`astlide mcp` で起動し、標準入出力（stdio）で MCP のやり取りをします（[Bun](https://bun.sh) で動きます）。Astlide を入れたプロジェクトなら、追加のインストールは要りません。

ツールを呼ぶたびに対象の Astlide プロジェクトを指定し、そのプロジェクトにインストールされている `@astlide/core` を使って動きます。

### ツール

| ツール | 引数 | 戻り値 |
|---|---|---|
| `template_layouts` | `templatePath`（`.pptx` / `.potx` / `.thmx`） | テンプレートのレイアウト（`slideLayout` に使う ID、PowerPoint での名前と種類、タイトル / 本文 / スライド番号のプレースホルダー、各レイアウトで描画される組み込みレイアウト（`cover`、`section`、`default`、`two-column`、`code`））と、テーマの色とフォント |
| `import_pptx` | `path`、省略可能な `projectRoot`、`deck`、`force`、`includeHtml` | 各スライドのタイトル、スピーカーノート、Markdown にしたテキスト。`projectRoot` を指定すると、[`astlide import`](/ja/guides/import/) と同じように編集可能なデッキも書き出します |
| `check_deck` | `projectRoot`、`deck`、省略可能な `build` | スライドごとの、収まっていないテキストやボックス（後述） |
| `render_deck` | `projectRoot`、`deck`、`formats`（`pptx`、`pdf`）、省略可能な `outDir`（プロジェクト内）、`build` | [`astlide export`](/ja/guides/export/) と同じように書き出したファイルのパス |

`check_deck` と `render_deck` はサイトを自分でビルドするので（`check_deck` は `dist/` がデッキより古い場合のみ）、開発サーバーは不要です。ビルドではプロジェクトの Astro 設定が実行されるため、どちらのツールも読み取り専用とは申告していません。`check_deck` に `build: false` を指定すると、読み取りだけを行います。PDF のエクスポートには Playwright の Chromium（`bunx playwright install chromium`）が必要です。

ビルドとエクスポートでは、プロジェクト自身のコードが実行されます（Astro の設定とインテグレーション、MDX のスライド、`bunfig.toml` の preload、プロジェクトにインストールされた `@astlide/core`）。`projectRoot` を指定した `import_pptx` も、プロジェクトの `astlide` CLI を実行します。そのため、次のようにしています。

- どのツールも読み取り専用とは申告していません（`check_deck` に `build: false` を指定した場合は読み取りだけです）。`import_pptx` は、`force` でデッキのフォルダーを置き換えるため、破壊的な操作として申告しています。`check_deck`、`render_deck`、プロジェクトを指定した `import_pptx` は、クライアント側で自動承認にせず、呼び出しのたびに確認する設定にしてください。
- 扱えるのは、サーバーに渡したフォルダーの中にあるプロジェクトだけです。次の順で決まります。
  - `--root <dir>`（複数指定できます）か `ASTLIDE_MCP_ROOTS`（`PATH` と同じ区切り）で指定したフォルダーが、外側の上限になります。
  - クライアントが MCP ルートを送ってくれば（Claude Code は送ってくるので設定は不要です）、その上限の中で使います。フォルダーを指定してある場合は、その中にあるルートだけが対象です。
  - どちらもなければ、サーバーを起動したフォルダーを使います。ただし、ファイルシステムのルート、ホームフォルダー、共有フォルダー（`/tmp`、`/Users/Shared`、`C:\Users\Public` など）と、それらより上のフォルダーは使いません。クライアントはサーバーをそうした場所で起動することが多いためです。この場合は、フォルダーを指定するまでどのプロジェクトも扱えません。

  クライアントのルートがそうした広すぎるフォルダーなら、そのルートだけを無視します（stderr に記録します）。ファイルシステムのルートは、指定しても対象になりません。プロジェクトのパスは最初に解決したものをそのまま使うので、あとからシンボリックリンクを差し替えても影響しません。どのフォルダーでも扱えるようにするには、サーバーの環境変数に `ASTLIDE_MCP_ANY_PROJECT=1` を設定します。
- 扱えるプロジェクトは、上のフォルダーそのものか、その直下にあるものだけです。`--root ~/slides` なら `~/slides/q3-review` は扱えますが、`~/slides/clones/someone-else` は扱えません（扱うなら、そのフォルダーを `--root` で指定します）。広いフォルダーを指定しても、その下にあるすべてのリポジトリが対象になるわけではありません。
- `template_layouts` と `import_pptx` が読むファイルも、同じフォルダーの中（深さは問いません。シンボリックリンクはたどった先で判定します）にある、拡張子の合った通常のファイルで、256 MB 以下に限ります。
- `import_pptx` は、デッキ名を自分で決め（`deck` を指定しなければファイル名から）、書き込む前に検査します。プロジェクトの `@astlide/core` が 2.8.0 より古い場合は、プロジェクトのものではなく、サーバー側の `astlide` CLI で書き込みます。
- ビルドとエクスポートには、必要な環境変数（`PATH`、`HOME`、ロケール、プロキシ、`ASTLIDE_*` など）だけを渡し、トークンやキーは渡しません。
- デッキ名は普通のフォルダー名に限り、出力先（`outDir`）はシンボリックリンクをたどった先も含めてプロジェクトの中に限ります。

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
args = ["astlide", "mcp", "--root", "/path/to/your/slides"]
```

### Gemini CLI

```json
// ~/.gemini/settings.json (or .gemini/settings.json in the project)
{
  "mcpServers": {
    "astlide": {
      "command": "bunx",
      "args": ["astlide", "mcp", "--root", "/path/to/your/slides"]
    }
  }
}
```

ほかの MCP クライアント（Claude Desktop など）でも、同じように `bunx astlide mcp --root /path/to/your/slides` と、プロジェクト（または複数のプロジェクトをまとめたフォルダー）を指定して起動します。MCP ルートを送るクライアントなら `--root` は要りません。

## デッキをチェックする

`check_deck` は、[PowerPoint エクスポート](/ja/guides/export/)を支えるエンジンでデッキをレイアウトし（1920×1080、テーマのフォントを使用、ブラウザは使いません）、スライドごとに次の問題を報告します。

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

- [`https://astlide.dev/llms.txt`](https://astlide.dev/llms.txt) — 全ページの一覧と 1 行の要約（[llms.txt 形式](https://llmstxt.org)）
- [`https://astlide.dev/llms-full.txt`](https://astlide.dev/llms-full.txt) — 全ページを 1 つにまとめた Markdown

Astlide のすべてを一度に把握させたいときは、エージェントに後者を渡してください。
