---
title: コーディングエージェント
description: Claude Code・Codex・Gemini CLI に Astlide のデッキを書かせ、はみ出しをチェックしてエクスポートさせるための設定です。MCP サーバー、エージェントスキル、llms.txt の 3 つを使います。
---

Astlide のスライドは普通のファイルなので、コーディングエージェントに書かせられます。エージェントにうまく書かせるために、Astlide は次の 3 つを用意しています。

- **MCP サーバー**: エージェントが呼べるツールを提供します。PowerPoint テンプレートの読み取り、`.pptx` のインポート、スライドに収まらないテキストの検出、デッキのエクスポートができます。
- **エージェントスキル**: スライドの書き方やレイアウトを教えます。書いてからチェックし、直してエクスポートするまでの手順も含みます。
- **テキスト版のドキュメント**: [`/llms.txt`](https://astlide.dev/llms.txt) と [`/llms-full.txt`](https://astlide.dev/llms-full.txt) で、ドキュメント全体を読ませられます。

## MCP サーバー

MCP サーバーは `@astlide/core` に同梱しています。Astlide を使っているプロジェクトなら、追加のインストールは要りません。`astlide mcp` で起動し、クライアントとは標準入出力（stdio）でやり取りします。実行には [Bun](https://bun.sh) が必要です。

どのツールも、呼び出しのたびに対象の Astlide プロジェクトを指定します。

### Claude Code に登録する

```bash
claude mcp add astlide -- bunx astlide mcp
```

チームで設定を共有するなら `--scope project` を付けてください。設定が `.mcp.json` に書き込まれます。

### Codex に登録する

```toml
# ~/.codex/config.toml
[mcp_servers.astlide]
command = "bunx"
args = ["astlide", "mcp", "--root", "/path/to/your/slides"]
```

### Gemini CLI に登録する

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

### そのほかのクライアント

Claude Desktop などほかの MCP クライアントでも、コマンドは `bunx astlide mcp --root /path/to/your/slides` で同じです。`--root` には、プロジェクトのフォルダーか、複数のプロジェクトをまとめて置いたフォルダーを渡します。クライアントが MCP ルートを送ってくる場合は、`--root` を省略できます。これらのフォルダーの扱いは「[サーバーが扱える範囲](#サーバーが扱える範囲)」で説明します。

### ツール

| ツール | 引数 | 戻り値 |
|---|---|---|
| `template_layouts` | `templatePath`（`.pptx` / `.potx` / `.thmx`） | テンプレートのレイアウト一覧とテーマの色・フォント。レイアウトごとに、`slideLayout` に書く ID、PowerPoint 上の名前と種類、タイトル・本文・スライド番号のプレースホルダー、そのレイアウトで描画する組み込みレイアウト（`cover`、`section`、`default`、`two-column`、`code`）を返します |
| `import_pptx` | `path`。省略可能: `projectRoot`、`deck`、`force`、`includeHtml` | 各スライドのタイトル、発表者ノート、Markdown に変換した本文。`projectRoot` を渡すと、[`astlide import`](/ja/guides/import/) と同じように編集可能なデッキも作成します |
| `check_deck` | `projectRoot`、`deck`。省略可能: `build` | スライドに収まっていないテキストやボックスの一覧（詳しくは後述） |
| `render_deck` | `projectRoot`、`deck`、`formats`（`pptx`、`pdf`）。省略可能: `outDir`（プロジェクト内）、`build` | 書き出したファイルのパス。出力は [`astlide export`](/ja/guides/export/) と同じです |

`check_deck` と `render_deck` は自分でサイトをビルドします。開発サーバーを起動しておく必要はありません。ビルドするかどうかは、ツールによって次のように違います。

- `check_deck` は、`dist/` がない場合か、デッキのファイルや Astro の設定より古い場合にだけビルドします。`build: true` なら毎回ビルドし、`build: false` ならビルドしません。
- `render_deck` は毎回ビルドします。`build: false` を渡すと、前回のエクスポート用ビルドを使います。それもなければ `dist/` を使います。

`render_deck` の出力先は、`outDir` を指定しなければプロジェクトの `exports/` です。PDF のエクスポートには Playwright の Chromium が必要です（`bunx playwright install chromium`）。

### サーバーが扱える範囲

ビルドやエクスポートでは、プロジェクトのコードがそのまま実行されます。Astro の設定とインテグレーション、MDX のスライド、`bunfig.toml` の preload、プロジェクトにインストールされた `@astlide/core` がその対象です。`projectRoot` を渡した `import_pptx` も、プロジェクトの `astlide` CLI を実行します。そのため、サーバーは扱える範囲を制限しています。

**ツールの呼び出しは毎回承認してください。** 読み取り専用と申告しているのは `template_layouts` だけです。`check_deck` と `render_deck` は読み取り専用として申告していません。`build: false` の `check_deck` は実際には読み取りしかしませんが、申告は変わりません。`import_pptx` は破壊的な操作として申告しています。`force` を付けると、同じ名前のデッキフォルダーを削除してから作り直すためです。`check_deck`、`render_deck`、プロジェクトを指定した `import_pptx` は自動承認にせず、呼び出しのたびに確認するようクライアントを設定してください。

**プロジェクトは許可されたフォルダーに置く必要があります。** 許可するフォルダーは、次の順で決まります。

1. `--root <dir>`（複数指定可）か `ASTLIDE_MCP_ROOTS`（区切り方は `PATH` と同じ）で指定したフォルダーが上限になります。
2. クライアントが MCP ルートを送ってくれば、それを使います。Claude Code は送ってくるので、設定は不要です。1 のフォルダーも指定している場合は、その中にあるルートだけが有効です。
3. どちらもなければ、サーバーを起動したフォルダーを使います。ただし、そのフォルダーがファイルシステムのルート、ホームフォルダー、共有フォルダー（`/tmp`、`/Users/Shared`、`C:\Users\Public` など）か、それらより上の階層なら使いません。クライアントはこうした場所でサーバーを起動しがちだからです。この場合は、フォルダーを指定するまでどのプロジェクトも扱えません。

プロジェクトの場所は、許可されたフォルダーそのものか、その直下に限ります。`--root ~/slides` なら `~/slides/q3-review` は扱えますが、`~/slides/clones/someone-else` は扱えません。後者を扱うには、そのフォルダーも `--root` で指定してください。広いフォルダーを 1 つ指定しただけで、その下にあるリポジトリがすべて対象になることを防ぐための制限です。

ほかにも次の決まりがあります。

- クライアントが送ってきたルートが広すぎる場合（3 で挙げた場所）は、そのルートだけを無視し、stderr に記録します。ファイルシステムのルートは、明示的に指定しても使いません。
- プロジェクトのパスは最初に一度だけ解決し、以降はその解決先で作業します。あとでシンボリックリンクを差し替えても影響しません。
- `template_layouts` と `import_pptx` が読むファイルも、許可されたフォルダーの中に置きます。深さは問いません。シンボリックリンクはリンク先の場所で判定します。拡張子が正しい通常のファイルで、256 MB 以下である必要があります。
- `import_pptx` はデッキ名を自分で決めます。`deck` を渡さなければファイル名から作り、何かを書き込む前に名前を検査します。プロジェクトの `@astlide/core` が 2.8.0 より古いときは、サーバーに同梱の `astlide` CLI でデッキを書き込みます。
- デッキ名に使えるのは普通のフォルダー名だけです。`outDir` は、シンボリックリンクをたどった先もプロジェクトの中でなければいけません。
- ビルドとエクスポートに渡す環境変数は、必要なもの（`PATH`、`HOME`、ロケール、プロキシ設定、`ASTLIDE_*` など）だけです。トークンやキーは渡しません。

この制限をすべて外すには、サーバーの環境変数に `ASTLIDE_MCP_ANY_PROJECT=1` を設定します。

## デッキをチェックする

`check_deck` は、[PowerPoint エクスポート](/ja/guides/export/)と同じエンジンでデッキをレイアウトします。サイズは 1920×1080 で、テーマのフォントを使います。ブラウザは使いません。見つかった問題は、スライドごとに次の種類で報告します。

| 種類 | 意味 |
|---|---|
| `text-clipped` | スライドか `overflow: hidden` のボックスでテキストが切れ、一部が見えない |
| `text-overflow` | テキストが入れ物（高さ固定のカード、カラム、スライドのコンテンツ領域）からはみ出している |
| `box-clipped` / `box-overflow` | 画像・表・埋め込みで同じことが起きている |
| `off-slide` | スライドの外に出ていて、どこにも切り取られていない |

報告には、スライド番号とタイトル、該当するテキスト、要素とはみ出し先、どちら側に何 px はみ出したかが入ります。

```text
2 problem(s) in 2 of 12 slides:
- Slide 4 "Results": 5 text blocks, "Churn fell to 2%" to "Next: EMEA", are cut off by the slide (186px bottom)
- Slide 9 "Pricing": text "Enterprise plans include single sign-on, audit logs and…" (p) is cut off by div.card (48px bottom)
```

エージェントはこの報告をもとに、テキストを短くする、スライドを分ける、レイアウトを変えるといった修正をして、もう一度チェックします。

チェックの対象はビルド後のデッキです。ビルド後のデッキには[非表示のスライド](/ja/guides/decks/#スライドを非表示にする)が含まれないので、報告のスライド番号は表示されるスライドだけで数えた番号になります。

テキストの幅は、デッキが読み込むフォント（`@font-face` のルールと Google Fonts）で測ります。フォントが見つからなければ結果にその旨が出て、幅は概算になります。Mermaid の図はブラウザがレイアウトするのでチェックしません。`.pptx` ファイルをそのまま表示したページもチェックの対象外です。

## エージェントスキル

[`skills/astlide/SKILL.md`](https://github.com/r-hashi01/astlide/tree/main/skills/astlide) は [Agent Skill](https://agentskills.io) 形式のスキルです。デッキの構成、frontmatter、レイアウト、コンポーネント、PowerPoint テンプレート、エクスポート、チェックの手順をまとめています。`slideLayout` を `layout` と書いてしまうような、よくある間違いも載せています。

- **Claude Code**: プロジェクトの `.claude/skills/astlide/` にフォルダーをコピーします。どのプロジェクトでも使うなら `~/.claude/skills/astlide/` に置いてください。

  ```bash
  mkdir -p .claude/skills && cp -r /path/to/astlide/skills/astlide .claude/skills/
  ```

- **ほかのエージェント**: Agent Skills に対応していれば、そのエージェントのスキル用ディレクトリに同じフォルダーを置きます。対応していなければ、指示ファイル（`AGENTS.md`、`GEMINI.md`）からこのファイルを参照させてください。

## llms.txt

ドキュメントは、言語モデル向けにプレーンテキストでも公開しています。

- [`https://astlide.dev/llms.txt`](https://astlide.dev/llms.txt): 全ページの一覧です。各ページに 1 行の要約が付きます（[llms.txt 形式](https://llmstxt.org)）。
- [`https://astlide.dev/llms-full.txt`](https://astlide.dev/llms-full.txt): 全ページの Markdown を 1 ファイルにまとめたものです。

Astlide のことを一度に全部把握させたいときは、エージェントに `llms-full.txt` を渡してください。
