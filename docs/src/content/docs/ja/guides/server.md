---
title: レンダリングサービス（HTTP API）
description: Astlide を HTTP サービスとして動かし、Markdown から PowerPoint / PDF / PNG を生成します。Dify、n8n などのツール向けに OpenAPI 仕様も提供します。
---

`@astlide/server`（リポジトリの `packages/server`）は Astlide を小さな HTTP API で包んだものです。API は呼べても Node や Astro は動かせないツール（Dify や n8n のカスタムツール、チャットボット、社内アプリなど）からスライドを作れます。

- `POST /render` — Markdown のスライドを、組み込みテーマまたはアップロードした PowerPoint テンプレートで、編集可能な **PPTX**、**PDF**、**PNG**（スライドごとに 1 枚の画像を含む ZIP）に変換します
- `POST /import` — `.pptx`（または Google スライドの URL）を、タイトルとスピーカーノート付きの HTML スライドに変換します
- `POST /templates/layouts` — PowerPoint テンプレートのレイアウトと、そのプレースホルダーの位置を返します
- `GET /openapi.json` — OpenAPI 3.1 仕様 · `GET /health` — ヘルスチェック

データは何も保存されません。レンダリングのたびに使い捨ての Astro プロジェクトを作り、レスポンスの準備ができた時点で削除します。アップロードされたファイルがほかの場所に書き込まれることもありません。

## Docker で動かす

イメージにはレンダリングに必要なものがすべて入っています。Node と Bun、PDF / PNG 用の Chromium、日本語・中国語・韓国語のテキストを描画するための Noto CJK フォントです。リポジトリのルートでビルドします。

```bash
docker build -f packages/server/Dockerfile -t astlide-server .
docker run --rm -p 8787:8787 astlide-server
```

```bash
curl localhost:8787/health
# {"status":"ok","version":"0.0.0","queue":{"running":0,"waiting":0}}
```

Docker を使わない場合は、リポジトリをクローンして実行します（Node 22.12 以降と Bun が必要です。PDF / PNG には `bunx playwright install chromium` も実行してください）。

```bash
bun install
bun packages/server/src/cli.ts
```

## スライドをレンダリングする

すべてのスライドを 1 つの Markdown 文字列で送り、スライドの間はちょうど `---` だけの行で区切ります。各スライドの先頭には frontmatter のブロックを置けます。キーはデッキと同じです（`slideLayout`、`title`、`notes`、`background`、`hidden` など）。

```bash
curl -o review.pptx -H 'content-type: application/json' localhost:8787/render -d '{
  "markdown": "---\nslideLayout: cover\n---\n# Quarterly review\n\nQ3 2026\n---\n# Highlights\n\n- Revenue up 12%\n- Two new regions",
  "theme": "corporate",
  "title": "Quarterly review",
  "format": "pptx"
}'
```

または `slides` を配列で送ります。要素は Markdown 文字列か、`markdown`（または `html`）と frontmatter を持つオブジェクトです。

```json
{
  "slides": [
    { "markdown": "# Quarterly review\n\nQ3 2026", "slideLayout": "cover" },
    { "markdown": "# Highlights\n\n- Revenue up 12%", "notes": "Mention the new regions" },
    { "markdown": "# Thanks", "frontmatter": { "background": "#0b132b" } }
  ],
  "format": "pdf"
}
```

| フィールド | |
| --- | --- |
| `markdown` / `slides` | スライド（どちらか一方）。 |
| `theme` | 組み込みテーマ: `default`、`dark`、`minimal`、`corporate`、`gradient`、`rose`、`forest`。 |
| `template` | テーマの代わりに使う PowerPoint テンプレート（`.pptx` / `.potx` / `.thmx`）。multipart ではファイルフィールド、JSON では `{ "filename": "brand.pptx", "data": "<base64>" }`。 |
| `format` | `pptx`（デフォルト）、`pdf`、`png`（スライドごとに 1 枚の PNG を含む ZIP）。 |
| `output` | `file`（デフォルト）: ファイルそのもの。`base64`: JSON しか扱えないクライアント向けの JSON `{ filename, contentType, size, data }`。 |
| `title`、`author`、`date` | デッキのメタデータ。タイトルはファイル名にも使われます。 |

スライドは MDX ではなく Markdown（`.md`）です。コンポーネントやインポートは使えないため、リクエストによってサーバー上でコードが実行されることはありません。なお、`---` で区切った区間が `key: value` の行だけでできていて、その後ろにまだ区間がある場合は、その区間は次のスライドの frontmatter として扱われます。

### PowerPoint テンプレートを使う

スライドと一緒にテンプレートをアップロードします（ここでは multipart）。組み込みのレイアウトはテンプレート側のレイアウトに対応付けられ（`cover` → タイトル スライド、`default` → タイトルとコンテンツ など）、テンプレートのすべてのレイアウトは ID でも指定できます。

```bash
curl -o q3.pptx localhost:8787/render \
  -F template=@brand.pptx \
  -F 'markdown=---
slideLayout: cover
---
# Q3 review
---
slideLayout: comparison
---
# Before / after'
```

`POST /templates/layouts` はそれらの ID と、各レイアウトのタイトル / 本文 / スライド番号のプレースホルダーの位置（1920×1080 のキャンバス上の px）を返します。LLM にスライドごとのレイアウトを選ばせるときに便利です。

```bash
curl -F file=@brand.pptx localhost:8787/templates/layouts
# {"fonts":{…},"aliases":{"cover":"title-slide",…},"layouts":[{"id":"title-slide","name":"Title Slide","title":{"left":72,…},"body":[…]},…]}
```

内容がプレースホルダーにどう入るかは [PowerPoint テンプレート](/astlide/ja/guides/templates/)を参照してください。

## デッキをインポートする

```bash
curl -F file=@kickoff.pptx localhost:8787/import
curl -H 'content-type: application/json' -d '{"url":"https://docs.google.com/presentation/d/…"}' localhost:8787/import
```

レスポンスには、各スライドが Astlide の HTML スライド（画像は `data:` URL として埋め込み）として含まれ、タイトル、スピーカーノート、非表示かどうかも返されます。この HTML は `{ "html": "…" }` のスライドとして `/render` にそのまま送れます。Google スライドのデッキは「リンクを知っている全員」に共有しておく必要があります。取得するのは `docs.google.com/presentation` の URL だけです。

## Dify、n8n などから使う

サービスは `GET /openapi.json` で自身を記述しています（OpenAPI 3.1。`servers` にはアクセスに使われた URL、または `PUBLIC_URL` が入ります）。

- **Dify** — ツール → カスタム → カスタムツールを作成 → *URL からインポート* を選び、`http://<host>:8787/openapi.json` を入力します。各オペレーション（`renderSlides`、`importPresentation`、`listTemplateLayouts`）が、エージェントやワークフローから呼べるツールになります。ツールが JSON を返す必要がある場面では `output: base64` を使ってください。API キーを設定した場合は、認証方式に *API Key* → *Bearer* を選びます。
- **n8n** — *HTTP Request* ノード（`POST /render`、レスポンス形式は *File*）を使うか、OpenAPI を読み込めるツールに仕様をインポートします。

## 設定

環境変数:

| 変数 | デフォルト | |
| --- | --- | --- |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | サーバーが待ち受けるポートとホスト。 |
| `ASTLIDE_API_KEY` | — | 設定すると、リクエストに `Authorization: Bearer <key>`（または `X-API-Key`）が必要になります。`/health` と `/openapi.json` は認証なしで使えます。 |
| `PUBLIC_URL` | リクエストから取得 | OpenAPI 仕様の `servers` に入れる URL。 |
| `MAX_BODY_MB` | `50` | リクエストの最大サイズ（超えると 413）。 |
| `MAX_SLIDES` | `200` | 1 回のレンダリングで扱えるスライドの最大数。 |
| `RENDER_TIMEOUT_MS` | `180000` | これより長くかかるレンダリングは中止されます（504）。 |
| `CONCURRENCY` / `MAX_QUEUE` | `2` / `16` | 同時に実行するレンダリングの数と、待機できる数。それを超えると 503 になります。 |
| `ASTLIDE_WORK_DIR` | `node_modules` と同じ階層の `.astlide-work` | リクエストごとのプロジェクトを作る場所。インストール済みのパッケージと親ディレクトリを共有している必要があります。 |

エラーは JSON `{ "error": "…" }` で返します。入力が不正なら 400 です。入力はビルドを始める前に検査します（スライドのスキーマが受け付けない frontmatter の値など）。ビルドやエクスポートに失敗したときは、ログの末尾を付けて 422 を返します。

## 制限事項

- レンダリングのたびに Astro のフルビルドが走ります。小さなデッキで 3〜5 秒ほど（PPTX でも PDF でも）、スライドが多ければさらにかかります。
- Markdown 内の生の HTML はそのまま描画され、PDF / PNG ではスライドを Chromium で読み込みます。サービスは、信頼できる利用者だけが呼び出せる環境（社内ネットワーク内、または `ASTLIDE_API_KEY` で認証をかけた状態）で動かしてください。
- PPTX エクスポートではスライドが使う Web フォントや画像を取得するため、サーバーからインターネットへの外向きの通信が必要です。
