---
title: コーディングエージェント
description: Claude Code、Codex、Gemini CLI にデッキを書かせ、チェックし、エクスポートさせるための MCP サーバー、エージェントスキル、llms.txt を紹介します。
---

Astlide のデッキはただのファイルなので、コーディングエージェントにも書けます。うまく書かせるために、次の 3 つを用意しています。

- **MCP サーバー**: PowerPoint テンプレートの読み取り、`.pptx` ファイルのインポート、収まらないテキストの検出、デッキのエクスポートをツールとして呼べます。
- **エージェントスキル**: スライドの書き方とレイアウト、それに「書く → チェック → 直す → エクスポート」の手順をエージェントに教えます。
- **テキスト版のドキュメント**: [`/llms.txt`](https://astlide.dev/llms.txt) と [`/llms-full.txt`](https://astlide.dev/llms-full.txt) で公開しています。

## MCP サーバー

MCP サーバーは `@astlide/core` に入っています。`astlide mcp` で起動し、標準入出力（stdio）でやり取りします。実行には [Bun](https://bun.sh) を使います。Astlide を入れたプロジェクトなら、追加で何かをインストールする必要はありません。

ツールを呼ぶときは、毎回どの Astlide プロジェクトを扱うかを指定します。処理には、そのプロジェクトにインストールされている `@astlide/core` を使います。

### ツール

| ツール | 引数 | 戻り値 |
|---|---|---|
| `template_layouts` | `templatePath`（`.pptx` / `.potx` / `.thmx`） | テンプレートのレイアウト一覧（`slideLayout` に指定する ID、PowerPoint での名前と種類、タイトル / 本文 / スライド番号のプレースホルダー、そのレイアウトで描く組み込みレイアウト（`cover`、`section`、`default`、`two-column`、`code`））と、テーマの色とフォント |
| `import_pptx` | `path`、省略可能な `projectRoot`、`deck`、`force`、`includeHtml` | 各スライドのタイトル、発表者ノート、Markdown にしたテキスト。`projectRoot` を指定すると、[`astlide import`](/ja/guides/import/) と同じく編集できるデッキも書き出します |
| `check_deck` | `projectRoot`、`deck`、省略可能な `build` | 収まっていないテキストやボックス（スライドごと。後述） |
| `render_deck` | `projectRoot`、`deck`、`formats`（`pptx`、`pdf`）、省略可能な `outDir`（プロジェクト内）、`build` | 書き出したファイルのパス。書き出し方は [`astlide export`](/ja/guides/export/) と同じです |

`check_deck` と `render_deck` は自分でサイトをビルドするので、開発サーバーを起動しておく必要はありません。`check_deck` がビルドするのは、`dist/` がデッキより古いときだけです。ビルドするとプロジェクトの Astro 設定が実行されるため、どちらのツールも読み取り専用とは申告していません。`check_deck` に `build: false` を渡したときは、読み取りしかしません。PDF のエクスポートには Playwright の Chromium が必要です（`bunx playwright install chromium`）。

ビルドとエクスポートでは、プロジェクト自身のコードが動きます。Astro の設定とインテグレーション、MDX のスライド、`bunfig.toml` の preload、プロジェクトにインストールされた `@astlide/core` です。`projectRoot` を指定した `import_pptx` も、プロジェクトの `astlide` CLI を実行します。そのため、次の制限を設けています。

- 読み取り専用と申告しているツールはありません（`build: false` の `check_deck` は読み取りだけです）。`import_pptx` は `force` でデッキのフォルダーを置き換えるので、破壊的な操作として申告しています。`check_deck`、`render_deck`、プロジェクトを指定した `import_pptx` は自動承認にせず、呼ぶたびに確認するようクライアントを設定してください。
- 扱えるのは、サーバーに渡したフォルダーの中のプロジェクトだけです。フォルダーは次のように決まります。
  - `--root <dir>`（何度でも指定できます）または `ASTLIDE_MCP_ROOTS`（`PATH` と同じ区切り）で指定したフォルダーが上限です。
  - クライアントが MCP ルートを送ってくる場合は、上限の範囲内でそれを使います。Claude Code は送ってくるので、設定は要りません。上限のフォルダーを指定していれば、その中にあるルートだけが有効です。
  - どちらもなければ、サーバーを起動したフォルダーを使います。ただし、ファイルシステムのルート、ホームフォルダー、共有フォルダー（`/tmp`、`/Users/Shared`、`C:\Users\Public` など）と、それより上のフォルダーは使いません。クライアントはこうした場所でサーバーを起動することが多いからです。この場合、フォルダーを指定するまでどのプロジェクトも扱えません。

  クライアントのルートが広すぎるフォルダーなら、そのルートだけを無視して stderr に記録します。ファイルシステムのルートは、指定しても使いません。プロジェクトのパスは最初に一度だけ解決し、以後はその場所で作業します。あとからシンボリックリンクを差し替えても影響はありません。どのフォルダーでも扱えるようにするには、サーバーの環境変数に `ASTLIDE_MCP_ANY_PROJECT=1` を設定します。
- プロジェクトは、上のフォルダーそのものか、その直下になければいけません。`--root ~/slides` なら、`~/slides/q3-review` は扱えますが、`~/slides/clones/someone-else` は扱えません（扱うには、そのフォルダーも `--root` で指定します）。広いフォルダーを 1 つ指定しただけで、その下にあるリポジトリがすべて対象になるのを防ぐためです。
- `template_layouts` と `import_pptx` が読むファイルも、同じフォルダーの中に置きます。深さは問いませんが、シンボリックリンクはリンク先の場所で判定します。拡張子の合った通常のファイルで、256 MB 以下に限ります。
- `import_pptx` は、デッキ名を自分で決めます（`deck` を指定しなければファイル名から）。名前は書き込む前に検査します。プロジェクトの `@astlide/core` が 2.8.0 より古いときは、プロジェクトの `astlide` CLI ではなくサーバー側の CLI で書き込みます。
- ビルドとエクスポートには、必要な環境変数（`PATH`、`HOME`、ロケール、プロキシ、`ASTLIDE_*` など）だけを渡します。トークンやキーは渡しません。
- デッキ名には普通のフォルダー名しか使えません。出力先（`outDir`）はプロジェクトの中に限ります。シンボリックリンクもリンク先で判定します。

### Claude Code

```bash
claude mcp add astlide -- bunx astlide mcp
```

`--scope project` を付けると `.mcp.json` に書かれるので、チームで共有できます。

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

ほかの MCP クライアント（Claude Desktop など）でも、コマンドは同じ `bunx astlide mcp --root /path/to/your/slides` です。`--root` にはプロジェクトか、プロジェクトをまとめて置いたフォルダーを指定します。MCP ルートを送ってくるクライアントなら、`--root` は不要です。

## デッキをチェックする

`check_deck` は、[PowerPoint エクスポート](/ja/guides/export/)と同じエンジンでデッキをレイアウトします。サイズは 1920×1080 で、テーマのフォントを使い、ブラウザは使いません。そのうえで、スライドごとに次の問題を報告します。

| 種類 | 意味 |
|---|---|
| `text-clipped` | スライドや `overflow: hidden` のボックスでテキストが切れ、一部が見えない |
| `text-overflow` | テキストがボックス（高さ固定のカード、カラム、スライドのコンテンツ領域）からはみ出している |
| `box-clipped` / `box-overflow` | 画像、表、埋め込みで同じことが起きている |
| `off-slide` | スライドの外に出ていて、何にも切り取られていない |

報告には、スライド番号とタイトル、テキスト、要素とそのはみ出し先、どちら側に何 px はみ出したかが入ります。

```text
2 problem(s) in 2 of 12 slides:
- Slide 4 "Results": 5 text blocks, "Churn fell to 2%" to "Next: EMEA", are cut off by the slide (186px bottom)
- Slide 9 "Pricing": text "Enterprise plans include single sign-on, audit logs and…" (p) is cut off by div.card (48px bottom)
```

エージェントはこれを見て、テキストを削ったり、スライドを分けたり、レイアウトを変えたりしてから、もう一度チェックできます。

テキストの幅は、デッキが読み込むフォント（`@font-face` のルールと Google Fonts）で測ります。フォントが見つからないときは結果にそう書かれ、幅は概算になります。Mermaid の図（ブラウザがレイアウトするため）と、`.pptx` ファイルをそのまま表示したページはチェックしません。

## エージェントスキル

[`skills/astlide/SKILL.md`](https://github.com/r-hashi01/astlide/tree/main/skills/astlide) は [Agent Skill](https://agentskills.io) の形式で書いています。デッキの構成、frontmatter、レイアウト、コンポーネント、PowerPoint テンプレート、エクスポート、チェックの手順と、よくある間違い（`slideLayout` を `layout` と書いてしまう、など）をまとめています。

- **Claude Code**: プロジェクトの `.claude/skills/astlide/` にフォルダーをコピーします。すべてのプロジェクトで使うなら `~/.claude/skills/astlide/` に置きます。

  ```bash
  mkdir -p .claude/skills && cp -r /path/to/astlide/skills/astlide .claude/skills/
  ```

- **ほかのエージェント**: Agent Skills に対応していれば、スキル用のディレクトリに同じフォルダーを置けば読み込みます。対応していないエージェントには、指示ファイル（`AGENTS.md`、`GEMINI.md`）からこのファイルを参照させてください。

## llms.txt

ドキュメントは、言語モデル向けのテキストでも公開しています。

- [`https://astlide.dev/llms.txt`](https://astlide.dev/llms.txt) — 全ページの一覧と、それぞれ 1 行の要約（[llms.txt 形式](https://llmstxt.org)）
- [`https://astlide.dev/llms-full.txt`](https://astlide.dev/llms-full.txt) — 全ページを 1 つにまとめた Markdown

Astlide の全体を一度に把握させたいときは、エージェントに `llms-full.txt` を渡してください。
