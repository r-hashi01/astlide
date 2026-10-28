---
title: レンダリングサービス（HTTP API）
description: Astlide を HTTP サービスとして動かし、Markdown から PowerPoint / PDF / PNG を作ります。OpenAPI 仕様があるので Dify や n8n などから呼び出せます。
---

`@astlide/server`（リポジトリでは `packages/server`）は、Astlide を小さな HTTP API として動かすパッケージです。Dify や n8n のカスタムツール、チャットボット、社内アプリのように、API は呼べても Node や Astro は動かせないツールからスライドを作れます。

- `POST /render` — Markdown のスライドを、編集できる **PPTX**、**PDF**、**PNG**（スライド 1 枚につき画像 1 枚の ZIP）に変換します。見た目は組み込みテーマか、アップロードした PowerPoint テンプレートで決まります
- `POST /import` — `.pptx`（または Google スライドの URL）を HTML のスライドに変換します。タイトルと発表者ノートも付きます
- `POST /templates/layouts` — PowerPoint テンプレートのレイアウトと、各プレースホルダーの位置を返します
- `GET /openapi.json` — OpenAPI 3.1 の仕様 · `GET /health` — ヘルスチェック

サーバーには何も残りません。レンダリングのたびに使い捨ての Astro プロジェクトを作り、レスポンスができた時点で削除します。アップロードしたファイルをほかの場所に書き込むこともありません。

## Docker で動かす

イメージには、レンダリングに必要なものがすべて入っています。Node と Bun、PDF / PNG 用の Chromium、日本語・中国語・韓国語を表示するための Noto CJK フォントです。リポジトリのルートでビルドします。

```bash
docker build -f packages/server/Dockerfile -t astlide-server .
export ASTLIDE_API_KEY="$(openssl rand -hex 24)"
docker run --rm -p 8787:8787 -e ASTLIDE_API_KEY \
  --security-opt seccomp=packages/server/chromium-seccomp.json astlide-server
```

イメージはすべてのインターフェースで待ち受けるので、API キーを設定しないと起動しません（[セキュリティ](#セキュリティ)を参照）。seccomp プロファイルは、PDF / PNG の描画で Chromium のサンドボックスを動かすために使います。中身は Docker の標準プロファイルに、サンドボックスが使う名前空間のシステムコールを足したものです。指定しないと PDF / PNG の描画は失敗します。サンドボックスなしで描画することはありません。以下のリクエストには `-H "Authorization: Bearer $ASTLIDE_API_KEY"` を付けてください。`/health` と `/openapi.json` には不要です。

```bash
curl localhost:8787/health
# {"status":"ok","version":"0.0.0","queue":{"running":0,"waiting":0}}
```

Docker を使わずに、リポジトリをクローンして動かすこともできます。Node 22.12 以降と Bun が必要です。PDF / PNG を使うなら `bunx playwright install chromium` も実行してください。

```bash
bun install
bun packages/server/src/cli.ts   # 127.0.0.1 だけで待ち受けます
```

## スライドをレンダリングする

スライドはまとめて 1 つの Markdown 文字列にして送ります。スライドの区切りは `---` だけの行です。各スライドの先頭には frontmatter を書けます。キーはデッキと同じです（`slideLayout`、`title`、`notes`、`background`、`hidden` など）。

```bash
curl -o review.pptx -H 'content-type: application/json' localhost:8787/render -d '{
  "markdown": "---\nslideLayout: cover\n---\n# Quarterly review\n\nQ3 2026\n---\n# Highlights\n\n- Revenue up 12%\n- Two new regions",
  "theme": "corporate",
  "title": "Quarterly review",
  "format": "pptx"
}'
```

`slides` に配列で渡すこともできます。要素は Markdown の文字列か、`markdown`（または `html`）と frontmatter を持つオブジェクトです。

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
| `markdown` / `slides` | スライド。どちらか一方を指定します。 |
| `theme` | 組み込みテーマ: `default`、`dark`、`minimal`、`corporate`、`gradient`、`rose`、`forest`。 |
| `template` | テーマの代わりに使う PowerPoint テンプレート（`.pptx` / `.potx` / `.thmx`）。multipart ならファイルのフィールド、JSON なら `{ "filename": "brand.pptx", "data": "<base64>" }` で送ります。 |
| `format` | `pptx`（デフォルト）、`pdf`、`png`（スライド 1 枚につき PNG 1 枚の ZIP）。 |
| `output` | `file`（デフォルト）はファイルそのものを返します。`base64` は JSON `{ filename, contentType, size, data }` で返します。JSON しか扱えないクライアント向けです。 |
| `title`、`author`、`date` | デッキのメタデータ。タイトルはファイル名にも使います。 |

スライドは MDX でなく Markdown（`.md`）として処理します。コンポーネントやインポートは使えないので、リクエストからサーバー上でコードを実行されることはありません。`---` で区切った途中の区間が `key: value` の行だけでできているときは、次のスライドの frontmatter として読みます。

### PowerPoint テンプレートを使う

スライドと一緒にテンプレートをアップロードします（この例は multipart）。組み込みのレイアウトは、テンプレートの対応するレイアウトに割り当てます（`cover` → タイトル スライド、`default` → タイトルとコンテンツ など）。テンプレートのレイアウトはどれも ID で指定できます。

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

この ID は `POST /templates/layouts` で一覧できます。各レイアウトのタイトル・本文・スライド番号のプレースホルダーの位置（1920×1080 のキャンバス上の px）も返るので、LLM にスライドごとのレイアウトを選ばせるときに役立ちます。

```bash
curl -F file=@brand.pptx localhost:8787/templates/layouts
# {"fonts":{…},"aliases":{"cover":"title-slide",…},"layouts":[{"id":"title-slide","name":"Title Slide","title":{"left":72,…},"body":[…]},…]}
```

内容がプレースホルダーにどう入るかは [PowerPoint テンプレート](/ja/guides/templates/)を参照してください。

## デッキを取り込む

```bash
curl -F file=@kickoff.pptx localhost:8787/import
curl -H 'content-type: application/json' -d '{"url":"https://docs.google.com/presentation/d/…"}' localhost:8787/import
```

レスポンスには、スライドごとに Astlide の HTML スライド（画像は `data:` URL で埋め込み）、タイトル、発表者ノート、非表示かどうかが入っています。この HTML は `{ "html": "…" }` 形式のスライドとして、そのまま `/render` に送れます。Google スライドは「リンクを知っている全員」に共有しておいてください。取得するのは `docs.google.com/presentation` の URL だけです。

## Dify や n8n などから使う

このサービスの仕様は `GET /openapi.json` で取得できます。形式は OpenAPI 3.1 で、`servers` にはアクセスに使った URL（設定していれば `PUBLIC_URL`）が入ります。

- **Dify** — ツール → カスタム → カスタムツールを作成 → *URL からインポート* を選び、`http://<host>:8787/openapi.json` を入力します。各オペレーション（`renderSlides`、`importPresentation`、`listTemplateLayouts`）が、エージェントやワークフローから呼べるツールになります。ツールの戻り値を JSON にする必要があるときは `output: base64` を使ってください。API キーを設定している場合は、認証方式で *API Key* → *Bearer* を選びます。
- **n8n** — *HTTP Request* ノードを使います（`POST /render`、レスポンス形式は *File*）。OpenAPI を読めるツールなら、仕様をインポートしても使えます。

## 設定

設定は環境変数で行います。

| 変数 | デフォルト | |
| --- | --- | --- |
| `PORT` / `HOST` | `8787` / `127.0.0.1`（Docker イメージでは `0.0.0.0`） | 待ち受けるポートとホスト。 |
| `ASTLIDE_API_KEY` | — | 設定すると、リクエストに `Authorization: Bearer <key>`（または `X-API-Key`）が必要になります。`/health` と `/openapi.json` は認証なしで使えます。`HOST` がループバック以外なら必須です。 |
| `ASTLIDE_ALLOW_UNAUTHENTICATED` | `0` | `1` にすると、キーがなくてもループバック以外で待ち受けます。前段のゲートウェイや閉じたネットワークで呼び出し元を制限している場合だけ使ってください。 |
| `ASTLIDE_ALLOW_PRIVATE_NETWORK` | `0` | `1` にすると、スライドがサーバー側のネットワークからも読み込めるようになります（[セキュリティ](#セキュリティ)を参照）。 |
| `PUBLIC_URL` | リクエストから決定 | OpenAPI 仕様の `servers` に入れる URL。 |
| `MAX_BODY_MB` | `50` | リクエストの最大サイズ。超えると 413 です。Google スライドからダウンロードするサイズの上限も兼ねます。リクエストは 60 秒以内に届け終える必要があります。 |
| `MAX_SLIDES` | `200` | 1 回のレンダリングで扱えるスライドの最大数。 |
| `MAX_OUTPUT_MB` | `200` | 出力ファイル（PPTX、PDF、PNG の ZIP）の最大サイズ。超えると 422 です。 |
| `RENDER_TIMEOUT_MS` | `180000` | レンダリング（とアップロードされた PowerPoint ファイルの読み込み）がこれより長くかかると中止します（504）。 |
| `CONCURRENCY` / `MAX_QUEUE` | `2` / `16` | 同時に実行するレンダリングの数と、待たせておける数。これを超えたリクエストには、アップロードを読み込む前に 503 を返します。 |
| `ASTLIDE_CHROMIUM_SANDBOX` | `1` | PDF / PNG の描画で使う Chromium のサンドボックス。`0` で無効になります。呼び出し元がすべて信頼できる場合に限ってください（[セキュリティ](#セキュリティ)を参照）。 |
| `ASTLIDE_WORK_DIR` | `node_modules` と同じ階層の `.astlide-work` | リクエストごとのプロジェクトを作る場所。インストール済みのパッケージと同じ親ディレクトリの下に置く必要があります。 |

エラーは JSON `{ "error": "…" }` で返します。入力が不正なら 400 です。入力の検査はビルドを始める前に行います（スライドのスキーマが受け付けない frontmatter の値など）。ビルドやエクスポートに失敗したときは 422 を返し、ログの末尾を付けます。

## 制限事項

- レンダリングのたびに Astro のフルビルドが走ります。小さなデッキでも 3〜5 秒ほどかかり（PPTX でも PDF でも同じ）、スライドが多ければさらに延びます。
- PPTX に書き出すときは、スライドが使う Web フォントや画像をダウンロードします。そのため、サーバーからインターネットに接続できる必要があります。

## セキュリティ

リクエストで届くのは他人が書いたスライドです。Markdown に書かれた生の HTML はそのまま描画され、PDF / PNG ではそれをサーバー上の Chromium で読み込みます。そのため、次の対策をとっています。

- **ループバック以外で待ち受けるには API キーが必要です。** `ASTLIDE_API_KEY` がなければ、`HOST` が `127.0.0.1` / `localhost` でない限り起動しません。前段で呼び出し元を制限しているなら、`ASTLIDE_ALLOW_UNAUTHENTICATED=1` を設定すれば起動できます。
- **スライドからサーバー側のネットワークには届きません。** レンダリング中にスライドやエクスポーターが読み込めるのは、デッキ自身、`data:` / `blob:` URL、インターネット上の公開ホストだけです。ループバック、プライベートアドレス（`10/8`、`172.16/12`、`192.168/16`、`fc00::/7` など）、リンクローカル（クラウドのメタデータ `169.254.169.254` を含む）などの予約済みアドレスへの通信は、リダイレクト先も含めて拒否します。WebSocket と Service Worker も止めます。`ASTLIDE_ALLOW_PRIVATE_NETWORK=1` は、呼び出し元がすべて信頼でき、スライドが社内のリソースを使う場合だけ設定してください。
- Chromium は自分でほかのホストに接続しません。リクエストは Astlide が代わりに送り、その応答を Chromium に渡します。アドレスは接続する時点で判定し、判定したアドレスにそのまま接続します。そのため、判定のときと接続のときで DNS の応答を変えるホスト（DNS リバインディング）も通しません。リダイレクトも 1 段ごとに同じ判定をします。この経路を通らない通信は存在しないプロキシに送られます。WebRTC が独自に UDP を送ることもありません。
- 多層防御として、信頼できない呼び出し元に公開するなら、コンテナの外向き通信もファイアウォールやエグレスポリシーで公開インターネットだけに絞ってください。
- **ダウンロードする量には上限があります。** PDF / PNG の描画では、同時に 6 件まで、1 件 20 MB まで、合計 200 MB まで取得します。ページ自体はデッキの外へ移動できません（リロードやリダイレクトで描画中の内容が置き換わることはありません）。PPTX の書き出しでは、画像と埋め込みのプレビューで 1 つの上限を共有します。同時に 6 件、合計 200 MB、異なる URL は 200 件までです（画像は 1 件 20 MB まで、ページは 2 MB まで）。上限を超えた分は警告を出して飛ばします。同じサイトの iframe は 1 枚のスライドにつき 32 文書までレイアウトし、ページの中に同じページを入れることはありません。スライドが指定する Google Fonts は 1 回の描画で 12 ファミリーまでです。共有キャッシュは 512 MB 以下に保ちます。
- **描画には必要な環境変数だけを渡します。** 渡すのは `PATH`、`HOME`、一時フォルダー、ロケール、`PLAYWRIGHT_BROWSERS_PATH` と、サーバーの `ASTLIDE_*` 設定だけです。サーバーの秘密情報、クラウドの認証情報、プロキシの設定は渡しません。
- **メモリ:** Chromium のレンダラープロセスは 4 つまで、JavaScript のヒープはそれぞれ 512 MB までです。Linux では、メモリが足りなくなったときにサーバーより先に描画のプロセスが止まるよう設定します（`oom_score_adj`）。コンテナ自体にも上限を付けてください。

  ```bash
  docker run --memory 4g --pids-limit 512 … astlide-server
  ```
- リクエスト: URL のパスは 2 KB まで（超えると 414）です。リクエストの本文は 60 秒以内に届く必要があります（408）。
- **画像は URL で指定してください。** ファイルパスを指す Markdown の画像（`![](../x.png)`）は 400 で拒否します。Astro がサーバーのディスクから読み込んでしまうからです。`https:` か `data:` の URL を使ってください。
- スライドは必ず専用の frontmatter ブロックを付けて書き出します。本文が `---` で始まっていても本文のまま扱うので、frontmatter の検査をすり抜けることはできません。frontmatter では YAML のアンカーとエイリアス（`&a` / `*a`）は使えず、大きさは 1 スライドあたり 256 KB までです。
- **アップロードされた PowerPoint ファイル**（`/import`、`/templates/layouts`）は、レンダリングと同じキューに並べ、子プロセスで読み込みます。`RENDER_TIMEOUT_MS` より長くかかれば中止し（504）、結果が `MAX_OUTPUT_MB` を超えれば拒否します（422）。どちらの場合もサーバー本体は止まりません。
- **Chromium はサンドボックスの中で動きます。** レンダラーに不具合があっても、影響はサンドボックスの中にとどまります。サンドボックスにはユーザー名前空間が必要です。Docker では `--security-opt seccomp=packages/server/chromium-seccomp.json` を付けて起動してください（Docker の標準プロファイルに `clone` / `clone3` / `unshare` / `setns` を許可したもの）。ユーザー名前空間を制限している Linux ホスト（Ubuntu 24.04）では、マシン全体の制限は外さないでください。AppArmor のプロファイルで Playwright の Chromium にだけ許可します（[Linux での Chromium のサンドボックス](/ja/guides/export/#linux-での-chromium-のサンドボックス)を参照）。サンドボックスを起動できないと、PDF / PNG の描画は直し方を示して失敗します。サンドボックスなしで続行することはありません。`ASTLIDE_CHROMIUM_SANDBOX=0` で無効にできます（その場合、サーバーは起動時に警告を出します）。どちらの場合も、描画のプロセスに `ASTLIDE_API_KEY` は渡しません。サンドボックスを起動できなかったとき、API の呼び出し元には短いエラーだけを返します。ホスト側で何を変えればよいかといった詳細は、サーバーのログに出します。
- seccomp プロファイルはコンテナ全体にかかります。Bun のサーバーや、リクエストごとの Astro ビルドにも適用されるので、そこで動くコードもユーザー名前空間を作れます。用意できるなら、より厳しい構成にしてください。描画だけを別のコンテナでプロファイル付きで動かし、API サーバーはプロファイルなしのコンテナで動かします。
- API キーがないリクエストには、`/health`、`/openapi.json`、`/` 以外のすべてのパスで 401 を返します。存在しないパスも同じです。キーの比較は一定時間で行います。
