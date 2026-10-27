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
export ASTLIDE_API_KEY="$(openssl rand -hex 24)"
docker run --rm -p 8787:8787 -e ASTLIDE_API_KEY \
  --security-opt seccomp=packages/server/chromium-seccomp.json astlide-server
```

イメージはすべてのインターフェースで待ち受けるので、API キーなしでは起動しません（[セキュリティ](#セキュリティ)を参照）。seccomp プロファイルは、PDF / PNG の描画で Chromium がサンドボックスを使うためのものです（Docker の標準プロファイルに、サンドボックスが必要とする名前空間のシステムコールを足したもの）。指定しないと、PDF / PNG の描画はサンドボックスなしで動くのではなく、失敗します。以下のリクエストには `-H "Authorization: Bearer $ASTLIDE_API_KEY"` を付けてください。`/health` と `/openapi.json` には不要です。

```bash
curl localhost:8787/health
# {"status":"ok","version":"0.0.0","queue":{"running":0,"waiting":0}}
```

Docker を使わない場合は、リポジトリをクローンして実行します（Node 22.12 以降と Bun が必要です。PDF / PNG には `bunx playwright install chromium` も実行してください）。

```bash
bun install
bun packages/server/src/cli.ts   # 127.0.0.1 だけで待ち受けます
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

内容がプレースホルダーにどう入るかは [PowerPoint テンプレート](/ja/guides/templates/)を参照してください。

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
| `PORT` / `HOST` | `8787` / `127.0.0.1`（Docker イメージでは `0.0.0.0`） | サーバーが待ち受けるポートとホスト。 |
| `ASTLIDE_API_KEY` | — | 設定すると、リクエストに `Authorization: Bearer <key>`（または `X-API-Key`）が必要になります。`/health` と `/openapi.json` は認証なしで使えます。`HOST` がループバック以外なら必須です。 |
| `ASTLIDE_ALLOW_UNAUTHENTICATED` | `0` | `1` にすると、キーなしでもループバック以外で待ち受けます。前段のゲートウェイや閉じたネットワークで呼び出し元を制限している場合だけ使ってください。 |
| `ASTLIDE_ALLOW_PRIVATE_NETWORK` | `0` | `1` にすると、スライドからサーバー側のネットワークにアクセスできるようになります（[セキュリティ](#セキュリティ)を参照）。 |
| `PUBLIC_URL` | リクエストから取得 | OpenAPI 仕様の `servers` に入れる URL。 |
| `MAX_BODY_MB` | `50` | リクエストの最大サイズ（超えると 413）。Google スライドからダウンロードするサイズの上限も兼ねます。リクエストは 60 秒以内に送り終える必要があります。 |
| `MAX_SLIDES` | `200` | 1 回のレンダリングで扱えるスライドの最大数。 |
| `MAX_OUTPUT_MB` | `200` | 出力ファイル（PPTX、PDF、PNG の ZIP）の最大サイズ。超えると 422 になります。 |
| `RENDER_TIMEOUT_MS` | `180000` | これより長くかかるレンダリング（とアップロードされた PowerPoint ファイルの読み込み）は中止されます（504）。 |
| `CONCURRENCY` / `MAX_QUEUE` | `2` / `16` | 同時に実行するレンダリングの数と、待機できる数。それを超えると、アップロードを読み込む前に 503 を返します。 |
| `ASTLIDE_CHROMIUM_SANDBOX` | `1` | PDF / PNG の描画で使う Chromium のサンドボックス。`0` で無効にします。呼び出し元がすべて信頼できる場合だけにしてください（[セキュリティ](#セキュリティ)を参照）。 |
| `ASTLIDE_WORK_DIR` | `node_modules` と同じ階層の `.astlide-work` | リクエストごとのプロジェクトを作る場所。インストール済みのパッケージと親ディレクトリを共有している必要があります。 |

エラーは JSON `{ "error": "…" }` で返します。入力が不正なら 400 です。入力はビルドを始める前に検査します（スライドのスキーマが受け付けない frontmatter の値など）。ビルドやエクスポートに失敗したときは、ログの末尾を付けて 422 を返します。

## 制限事項

- レンダリングのたびに Astro のフルビルドが走ります。小さなデッキで 3〜5 秒ほど（PPTX でも PDF でも）、スライドが多ければさらにかかります。
- PPTX エクスポートではスライドが使う Web フォントや画像を取得するため、サーバーからインターネットへの外向きの通信が必要です。

## セキュリティ

リクエストで届くのは他人が書いたスライドです。Markdown 内の生の HTML はそのまま描画され、PDF / PNG ではそれをサーバー上の Chromium で読み込みます。そのため次のようにしています。

- **ループバック以外で待ち受けるには API キーが必要です。** `ASTLIDE_API_KEY` がなければ、`HOST` が `127.0.0.1` / `localhost` でない限り起動しません（前段で呼び出し元を制限しているなら `ASTLIDE_ALLOW_UNAUTHENTICATED=1` で起動できます）。
- **スライドからサーバー側のネットワークには届きません。** レンダリング中にスライドやエクスポーターが読み込めるのは、デッキ自身、`data:` / `blob:` URL、インターネット上の公開ホストだけです。ループバック、プライベートアドレス（`10/8`、`172.16/12`、`192.168/16`、`fc00::/7` など）、リンクローカル（クラウドのメタデータ `169.254.169.254` を含む）などの予約済みアドレスへの通信は、リダイレクト先も含めて拒否します。WebSocket と Service Worker も止めます。呼び出し元がすべて信頼でき、スライドに社内のリソースが必要な場合だけ `ASTLIDE_ALLOW_PRIVATE_NETWORK=1` を設定してください。
- Chromium はほかのホストに自分では接続しません。リクエストは Astlide が代わりに行い、その応答を Chromium に渡します。アドレスは接続する時点で判定するので、判定したアドレスにそのまま接続します。判定のときと接続のときで DNS の応答を変えるホスト（DNS リバインディング）も通りません。リダイレクトも 1 段ごとに同じ判定をかけます。この経路を通らない通信は存在しないプロキシに送られ、WebRTC が独自に UDP を送ることもありません。
- 多層防御として、信頼できない呼び出し元に公開するなら、コンテナの外向き通信もファイアウォールやエグレスポリシーで公開インターネットだけに絞ってください。
- **取得する量に上限があります。** PDF / PNG の描画では、同時に 6 件まで、1 件 20 MB まで、合計 200 MB まで取得します。ページそのものはデッキの外へ移動できません（リロードやリダイレクトで描画中の内容が置き換わることはありません）。PPTX の書き出しでは、画像と埋め込みのプレビューが 1 つの上限を共有します。同時に 6 件、合計 200 MB、異なる URL は 200 件までです（画像は 1 件 20 MB まで、ページは 2 MB まで）。超えた分は警告を出して飛ばします。同じサイトの iframe は 1 枚のスライドにつき 32 文書までレイアウトし、ページが自分自身を表示することはありません。スライドが指定する Google Fonts は、1 回の描画で 12 ファミリーまでで、共有のキャッシュは 512 MB 以下に保ちます。
- **描画には必要な環境変数だけを渡します。** `PATH`、`HOME`、一時フォルダー、ロケール、`PLAYWRIGHT_BROWSERS_PATH` と、サーバーが設定する `ASTLIDE_*` だけです。サーバーの秘密情報、クラウドの認証情報、プロキシの設定は渡りません。
- **メモリ:** Chromium のレンダラープロセスは 4 つまで、JavaScript のヒープはそれぞれ 512 MB までです。Linux では、メモリが足りなくなったとき、サーバーより先に描画のプロセスが止められるよう設定します（`oom_score_adj`）。コンテナ自体にも上限を付けてください。

  ```bash
  docker run --memory 4g --pids-limit 512 … astlide-server
  ```
- リクエスト: URL のパスは 2 KB まで（超えると 414）、リクエストの本文は 60 秒以内に届く必要があります（408）。
- **画像は URL で指定してください。** ファイルパスを指す Markdown の画像（`![](../x.png)`）は 400 で拒否します。Astro がサーバーのディスクから読み込んでしまうためです。`https:` か `data:` の URL を使ってください。
- スライドは必ず自前の frontmatter ブロックを付けて書き出します。本文が `---` で始まっていても本文のまま扱われ、frontmatter の検査をすり抜けることはありません。frontmatter では YAML のアンカーとエイリアス（`&a` / `*a`）は使えず、大きさは 1 スライドあたり 256 KB までです。
- **アップロードされた PowerPoint ファイル**（`/import`、`/templates/layouts`）は、レンダリングと同じキューを通して子プロセスで読み込みます。`RENDER_TIMEOUT_MS` より長くかかれば中止し（504）、結果が `MAX_OUTPUT_MB` を超えれば拒否します（422）。どちらの場合もサーバー本体は止まりません。
- **Chromium はサンドボックスの中で動きます。** レンダラーに不具合があっても、影響はサンドボックスの中にとどまります。サンドボックスにはユーザー名前空間が必要です。Docker では `--security-opt seccomp=packages/server/chromium-seccomp.json` を付けて起動してください（Docker の標準プロファイルに `clone` / `clone3` / `unshare` / `setns` を許可したもの）。ユーザー名前空間を制限している Linux ホスト（Ubuntu 24.04）では、マシン全体の制限を外すのではなく、AppArmor のプロファイルで Playwright の Chromium にだけ許可してください（[Linux での Chromium のサンドボックス](/ja/guides/export/#linux-での-chromium-のサンドボックス)を参照）。サンドボックスを起動できないとき、PDF / PNG の描画は直し方を示して失敗します。サンドボックスなしに切り替えて動くことはありません。`ASTLIDE_CHROMIUM_SANDBOX=0` で無効にできます（その場合、サーバーは起動時に警告を出します）。どちらの場合も、描画プロセスに `ASTLIDE_API_KEY` は渡しません。サンドボックスを起動できないとき、API の呼び出し元には短いエラーだけを返し、詳細（ホスト側で何を変えればよいか）はサーバーのログに出します。
- seccomp プロファイルはコンテナ全体にかかります。Bun のサーバーや、リクエストごとの Astro ビルドにも適用されるので、そこで動くコードもユーザー名前空間を作れます。より厳しくするなら、描画だけを別のコンテナで（プロファイル付きで）動かし、API サーバーはプロファイルなしのコンテナで動かす構成にしてください。
- API キーがないリクエストには、`/health`、`/openapi.json`、`/` 以外のすべてのパスで 401 を返します（存在しないパスも含みます）。キーは一定時間で比較します。
