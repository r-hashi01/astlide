---
title: レンダリングサービス（HTTP API）
description: Astlide を HTTP サービスとして動かし、Markdown から PowerPoint・PDF・PNG を作ります。OpenAPI 仕様を公開しているので、Dify や n8n などから呼び出せます。
---

`@astlide/server`（リポジトリでは `packages/server`）は、Astlide を HTTP API として動かすパッケージです。Dify や n8n のツール、チャットボット、社内アプリなど、HTTP API は呼べても Node や Astro は動かせない環境からスライドを作りたいときに使います。

| エンドポイント | 内容 |
| --- | --- |
| `POST /render` | Markdown のスライドから、編集できる **PPTX**、**PDF**、**PNG** 画像（スライド 1 枚ごとに 1 画像を入れた ZIP）を作ります。デザインは組み込みテーマか、アップロードした PowerPoint テンプレートで決まります。 |
| `POST /import` | `.pptx` ファイルか Google スライドの URL を受け取り、スライドを 1 枚ずつ HTML にして返します。タイトルと発表者ノートも付きます。 |
| `POST /templates/layouts` | PowerPoint テンプレートを受け取り、レイアウトの一覧と各プレースホルダーの位置を返します。 |
| `GET` `POST /templates`<br>`GET` `DELETE /templates/{name}`<br>`GET /templates/{name}/file` | PowerPoint テンプレートに名前を付けてサーバーに保存しておき、レンダリングのたびにアップロードしなくて済むようにします。テンプレートの保存を有効にしたときだけ使えます（[テンプレートをサーバーに保存する](#テンプレートをサーバーに保存する)を参照）。 |
| `GET /openapi.json` | OpenAPI 3.1 の仕様を返します。 |
| `GET /health` | ヘルスチェックです。 |

レンダリングはリクエストごとに一時的な Astro プロジェクトで行い、レスポンスを返す準備ができた時点で削除します。レンダリングや取り込みで送られたファイルを、ほかの場所に保存することもありません。サーバーに残るのは `/templates` にアップロードしたテンプレートだけで、それもテンプレートの保存を有効にした場合に限ります。

## Docker で動かす

Docker イメージには、レンダリングに必要なものが一式入っています。Node と Bun、PDF と PNG の出力に使う Chromium、日本語・中国語・韓国語の表示に使う Noto CJK フォントです。リポジトリのルートでイメージをビルドし、API キーを付けて起動します。

```bash
docker build -f packages/server/Dockerfile -t astlide-server .
export ASTLIDE_API_KEY="$(openssl rand -hex 24)"
docker run --rm -p 8787:8787 -e ASTLIDE_API_KEY \
  --security-opt seccomp=packages/server/chromium-seccomp.json astlide-server
```

コンテナはすべてのネットワークインターフェースで待ち受けます。そのため、API キーがないと起動しません（[セキュリティ](#セキュリティ)を参照）。

seccomp プロファイルは、Docker の標準プロファイルに Chromium のサンドボックスが使う名前空間関連のシステムコールを加えたものです。これを指定しないと、PDF と PNG のレンダリングは失敗します。サンドボックスを外した Chromium で代わりに描画することはありません。

リクエストには毎回 `-H "Authorization: Bearer $ASTLIDE_API_KEY"` を付けてください。以降の例では省略しています。`/health` と `/openapi.json` はキーなしで呼べます。

```bash
curl localhost:8787/health
# {"status":"ok","version":"0.0.0","queue":{"running":0,"waiting":0}}
```

Docker を使わない場合は、リポジトリをクローンしてそのまま起動できます。Node 22.12 以降と Bun が必要です。PDF や PNG も出力するなら、`bunx playwright install chromium` で Chromium を入れておきます。

```bash
bun install
bun packages/server/src/cli.ts   # 127.0.0.1 だけで待ち受けます
```

## スライドをレンダリングする

すべてのスライドを 1 つの Markdown 文字列にまとめて送ります。スライドの区切りは `---` だけを書いた行です。各スライドの先頭には frontmatter を書けます。使えるキーはデッキのスライドと同じで、`slideLayout`、`title`、`notes`、`background`、`hidden` などがあります。

```bash
curl -o review.pptx -H 'content-type: application/json' localhost:8787/render -d '{
  "markdown": "---\nslideLayout: cover\n---\n# Quarterly review\n\nQ3 2026\n---\n# Highlights\n\n- Revenue up 12%\n- Two new regions",
  "theme": "corporate",
  "title": "Quarterly review",
  "format": "pptx"
}'
```

スライドを 1 枚ずつ組み立てるなら、`slides` に配列で渡す方法もあります。配列の要素には Markdown の文字列を入れるか、`markdown`（または `html`）と frontmatter のキーを持つオブジェクトを入れます。

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

| フィールド | 説明 |
| --- | --- |
| `markdown` / `slides` | スライドの中身です。どちらか一方を指定します。 |
| `theme` | 組み込みテーマの名前です。`default`、`dark`、`minimal`、`corporate`、`gradient`、`rose`、`forest` から選びます。 |
| `template` | テーマの代わりに使う PowerPoint テンプレート（`.pptx`、`.potx`、`.thmx`）です。multipart ではファイルとして送ります。JSON では `{ "filename": "brand.pptx", "data": "<base64>" }` の形で送ります。[サーバーに保存したテンプレート](#テンプレートをサーバーに保存する)なら、名前を書くだけで済みます。 |
| `templateVersion` | 保存したテンプレートを名前で指定するときに、使う版の番号を指定します。省略すると最新の版を使います。 |
| `format` | `pptx`（デフォルト）、`pdf`、`png` のいずれかです。`png` はスライドごとの PNG を ZIP にまとめて返します。 |
| `output` | `file`（デフォルト）ではファイルそのものを返します。`base64` では JSON の `{ filename, contentType, size, data }` を返します。JSON しか扱えないクライアントで使います。 |
| `title`、`author`、`date` | デッキのメタデータです。タイトルはファイル名にも使います。 |

スライドは Markdown（`.md`）として処理します。MDX ではないため、コンポーネントや `import` 文は使えません。リクエストの内容によってサーバー上でコードが実行されるのを防ぐためです。

Markdown 文字列を区切るとき、`key: value` の行だけでできた区間は、その次のスライドの frontmatter として扱います。

### PowerPoint テンプレートを使う

テンプレートはスライドと一緒にアップロードします。次の例は multipart で送っています。

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

Astlide の組み込みレイアウトは、テンプレート側の対応するレイアウトで描画します。たとえば `cover` はテンプレートのタイトルスライド、`default` はタイトルとコンテンツのレイアウトになります。テンプレートにあるレイアウトは、ID を書けばどれでも使えます。

ID を調べるには、テンプレートを `POST /templates/layouts` に送ります。レスポンスには、各レイアウトのタイトル・本文・スライド番号のプレースホルダーの位置も入っています。位置は 1920×1080 のキャンバス上の px です。LLM にスライドごとのレイアウトを選ばせるときの材料になります。

```bash
curl -F file=@brand.pptx localhost:8787/templates/layouts
# {"fonts":{…},"aliases":{"cover":"title-slide",…},"layouts":[{"id":"title-slide","name":"Title Slide","title":{"left":72,…},"body":[…]},…]}
```

スライドの内容がプレースホルダーにどう収まるかは、[PowerPoint テンプレート](/ja/guides/templates/)で説明しています。

## テンプレートをサーバーに保存する

チームで使うテンプレートが決まっているなら、一度アップロードしておけば、あとは名前で指定するだけでレンダリングできます。保存を有効にするには、`ASTLIDE_TEMPLATE_STORE` に保存先を指定します。保存先はディレクトリでも S3 のバケットでもかまいません。

ディレクトリに保存する場合、Docker ではそこにボリュームをマウントしておくと、コンテナを作り直してもテンプレートが消えません。

```bash
docker run --rm -p 8787:8787 -e ASTLIDE_API_KEY \
  -e ASTLIDE_TEMPLATE_STORE=/data/templates -v astlide-templates:/data/templates \
  --security-opt seccomp=packages/server/chromium-seccomp.json astlide-server
```

バケットに保存すれば、テンプレートはコンテナと切り離して管理でき、複数のサーバーから同じテンプレートを使えます。`ASTLIDE_TEMPLATE_STORE=s3://<バケット>/<プレフィックス>` と指定し、認証情報は AWS でおなじみの環境変数で渡します。S3 互換の API を持つストレージなら、`AWS_ENDPOINT_URL_S3` にその URL を指定すれば同じように使えます。

```bash
# AWS S3
-e ASTLIDE_TEMPLATE_STORE=s3://acme-assets/astlide/templates \
-e AWS_REGION=ap-northeast-1 -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY

# Cloudflare R2
-e ASTLIDE_TEMPLATE_STORE=s3://astlide-templates \
-e AWS_ENDPOINT_URL_S3=https://<アカウント ID>.r2.cloudflarestorage.com -e AWS_REGION=auto \
-e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY
```

アクセスキーには、プレフィックス以下のオブジェクトの読み取り・書き込み・削除・一覧の権限が必要です。AWS なら `s3:GetObject`、`s3:PutObject`、`s3:DeleteObject`、`s3:ListBucket` です。サーバーが読むのはこれらの環境変数のキーだけで、インスタンスやコンテナに割り当てた IAM ロールは使いません。サーバー用のアクセスキーを発行してください。これらの環境変数がレンダリング処理に渡ることはありません。

テンプレートは名前を付けてアップロードします。名前に使えるのは英小文字・数字・ハイフンで、組み込みテーマと同じ名前は付けられません。`label` には画面などに出す表示名を入れられます（省略可）。

```bash
curl localhost:8787/templates -F name=acme -F label="Acme 2026" -F file=@acme.potx
# {"name":"acme","label":"Acme 2026","latest":1,"versions":[{"version":1,"ext":".potx",…}],…}
```

レンダリングでは、ファイルの代わりに名前を書きます。

```bash
curl -o q3.pptx -H 'content-type: application/json' localhost:8787/render -d '{
  "markdown": "# Q3 review\n---\n# Highlights\n\n- Revenue up 12%",
  "template": "acme"
}'
```

同じ名前でもう一度アップロードすると新しい版として追加され、以降のレンダリングはその版を使います。前の版も残っているので、`"templateVersion": 1` のように指定すれば元のデザインで書き出せますし、ファイルをダウンロードすることもできます。

アップロードされたファイルは、保存する前に一度読み込みます。PowerPoint のテンプレートとして読めないファイルはその場で拒否し、読めたものはレイアウトの情報と一緒に保存します。

| リクエスト | 内容 |
| --- | --- |
| `GET /templates` | 保存しているテンプレートと、それぞれの版の一覧を返します。 |
| `POST /templates` | テンプレートを保存します（`name`、`file`、省略可の `label`）。すでにある名前なら新しい版として追加します。新しいテンプレートなら 201、版の追加なら 200 を返します。 |
| `GET /templates/{name}` | テンプレートの版の一覧と、最新版のレイアウトを返します。レイアウトの形式は `POST /templates/layouts` と同じです。`?version=` を付けると、その版のレイアウトを返します。 |
| `GET /templates/{name}/file` | アップロードされたときのままのファイルをダウンロードします。前の版は `?version=` で指定します。 |
| `DELETE /templates/{name}` | テンプレートを版ごとすべて削除します。`?version=` を付けると、その版だけを削除します。最後の版を削除すると、テンプレートそのものがなくなります。 |

版の番号は 1、2、3 と増えていき、削除した版の番号を使い回すことはありません。同じ番号はいつも同じファイルを指します。

テンプレートは、名前と同じディレクトリ（バケットではプレフィックス）の下に、`manifest.json` と版ごとのファイルとして保存します。レンダリングだけなら複数のサーバーで同じ保存先を使えます。ただし、テンプレートを追加・削除するサーバーは 1 台にしてください。2 台が同時にアップロードすると、`manifest.json` を互いに上書きしてしまうおそれがあります。

自分のプログラムからも、同じ仕組みを `@astlide/core/templates` から使えます。ディレクトリに保存するなら `createTemplateStore(dir)`、バケットなら `createS3TemplateStore({ bucket, … })` を使います。どちらも `list`・`info`・`get`・`put`・`remove` を持つオブジェクトを返します。Google Cloud Storage や Azure Blob Storage など別のストレージを使うなら、オブジェクトの `read`・`write`・`delete`・`list` を行う `ObjectStorage` を実装して、`createObjectTemplateStore()` に渡してください。

## デッキを取り込む

`.pptx` ファイルか、Google スライドの URL を送ります。

```bash
curl -F file=@kickoff.pptx localhost:8787/import
curl -H 'content-type: application/json' -d '{"url":"https://docs.google.com/presentation/d/…"}' localhost:8787/import
```

レスポンスには、デッキのタイトル、作成者、サイズ、テーマが入っています。スライドごとの情報は、Astlide の HTML 形式のスライド本体、タイトル、発表者ノート、非表示かどうかの 4 つです。画像は `data:` URL として HTML に埋め込まれます。この HTML は `{ "html": "…" }` 形式のスライドとして、そのまま `/render` に送り返せます。

Google スライドは、`docs.google.com/presentation` の URL だけを取得します。事前に共有設定を「リンクを知っている全員」にしておかないと、ダウンロードに失敗します。

## Dify や n8n から使う

`GET /openapi.json` で、このサービスの OpenAPI 3.1 仕様を取得できます。仕様の `servers` には、サービスへのアクセスに使った URL が入ります。`PUBLIC_URL` を設定していれば、その値が入ります。

- **Dify**: ツール → カスタム → カスタムツールを作成 と進み、*URL からインポート* で `http://<host>:8787/openapi.json` を入力します。`renderSlides`、`importPresentation`、`listTemplateLayouts` や、`listTemplates` などのテンプレート管理の各オペレーションが、エージェントやワークフローから呼べるツールとして登録されます。ツールの戻り値を JSON にしたいときは `output: base64` を指定してください。サーバーに API キーを設定している場合は、認証方式で *API Key* → *Bearer* を選びます。
- **n8n**: *HTTP Request* ノードで `POST /render` を呼び、レスポンス形式を *File* にします。OpenAPI の仕様を読み込めるツールであれば、仕様をそのままインポートしても使えます。

## 設定

設定は環境変数で指定します。

| 変数 | デフォルト | 説明 |
| --- | --- | --- |
| `PORT` / `HOST` | `8787` / `127.0.0.1`（Docker イメージでは `0.0.0.0`） | 待ち受けるポートとアドレスです。 |
| `ASTLIDE_API_KEY` | （なし） | 設定すると、リクエストに `Authorization: Bearer <key>` か `X-API-Key: <key>` が必要になります。`/health` と `/openapi.json` はキーなしで使えます。`HOST` がループバック以外のときは必須です。 |
| `ASTLIDE_ALLOW_UNAUTHENTICATED` | `0` | `1` にすると、キーがなくてもループバック以外で待ち受けます。前段のゲートウェイや閉じたネットワークで呼び出し元を制限している場合だけ使ってください。 |
| `ASTLIDE_ALLOW_PRIVATE_NETWORK` | `0` | `1` にすると、スライドがサーバー側のネットワークにあるリソースを読み込めるようになります（[セキュリティ](#セキュリティ)を参照）。 |
| `PUBLIC_URL` | リクエストから決定 | OpenAPI 仕様の `servers` に書き込む URL です。 |
| `MAX_BODY_MB` | `50` | リクエスト本文の上限です。超えると 413 を返します。Google スライドからダウンロードするサイズの上限も兼ねます。 |
| `MAX_SLIDES` | `200` | 1 回のレンダリングで扱うスライド数の上限です。 |
| `MAX_OUTPUT_MB` | `200` | 出力ファイル（PPTX、PDF、PNG の ZIP）のサイズ上限です。超えると 422 を返します。 |
| `RENDER_TIMEOUT_MS` | `180000` | レンダリングと、アップロードされた PowerPoint ファイルの読み込みの制限時間です。超えると処理を止めて 504 を返します。 |
| `CONCURRENCY` / `MAX_QUEUE` | `2` / `16` | 同時に実行するレンダリングの数と、待機できるリクエストの数です。これを超えたリクエストには、アップロードを読み込む前に 503 を返します。 |
| `ASTLIDE_CHROMIUM_SANDBOX` | `1` | PDF と PNG の出力に使う Chromium のサンドボックスです。`0` で無効になります。無効にするのは、呼び出し元をすべて信頼できる場合に限ってください（[セキュリティ](#セキュリティ)を参照）。 |
| `ASTLIDE_TEMPLATE_STORE` | （なし） | テンプレートの保存先です。ディレクトリか `s3://<バケット>/<プレフィックス>` を指定すると、テンプレートの保存が有効になります（[テンプレートをサーバーに保存する](#テンプレートをサーバーに保存する)を参照）。指定しない場合、`/templates` 以下は 404 を返します。 |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` | （なし） | `s3://` の保存先に使う認証情報です。`s3://` を指定してキーがない場合、サーバーは起動しません。 |
| `AWS_REGION` / `AWS_ENDPOINT_URL_S3` | `us-east-1` / AWS | バケットのリージョンと、R2 や MinIO など S3 互換サービスの URL です。 |
| `ASTLIDE_WORK_DIR` | `node_modules` と同じ階層の `.astlide-work` | リクエストごとの一時プロジェクトを作る場所です。インストール済みのパッケージと共通の親ディレクトリの下に置く必要があります。 |

エラーは JSON の `{ "error": "…" }` で返します。入力が不正なときは 400 です。入力はビルドを始める前に検査するので、スライドのスキーマに合わない frontmatter の値もこの段階で弾かれます。ビルドやエクスポートが失敗したときは 422 を返し、ビルドログの末尾を付けます。

## 制限事項

- レンダリングのたびに Astro のビルドを最初から実行します。小さなデッキでも、PPTX や PDF の出力に 3〜5 秒ほどかかります。スライドが多いほど時間は延びます。
- PPTX の出力では、スライドが使う Web フォントと画像をダウンロードします。サーバーからインターネットに接続できる必要があります。

## セキュリティ

リクエストの中身は、信頼できない第三者が書いたものとして扱う必要があります。Markdown に書かれた生の HTML はそのまま描画されます。PDF と PNG の出力では、その HTML をサーバー上の Chromium で読み込みます。サービス側では以下の対策をとっています。運用環境に応じて、追加の対策も検討してください。

### アクセス制御

- ループバック以外で待ち受けるには API キーが必要です。`ASTLIDE_API_KEY` が設定されていない場合、`HOST` が `127.0.0.1`、`localhost`、`::1` のいずれかでなければ起動しません。前段のゲートウェイやネットワークで呼び出し元を制限しているなら、`ASTLIDE_ALLOW_UNAUTHENTICATED=1` を設定して起動できます。
- 正しいキーがないリクエストには、`/`、`/health`、`/openapi.json` 以外のすべてのパスで 401 を返します。存在しないパスも同じ扱いです。キーの比較には、比較にかかる時間から内容を推測されない方式（定数時間比較）を使います。
- テンプレートの保存を有効にすると、API キーを持っている人なら誰でもテンプレートを追加・ダウンロード・削除できます。呼び出し元にテンプレートを変更させたくない場合は、前段にゲートウェイを置き、`GET /templates…` と `POST /render` だけを通すようにしてください。

### レンダリング中の通信

- スライドとエクスポーターが読み込めるのは、デッキ自身、`data:` と `blob:` の URL、インターネット上の公開ホストだけです。ループバック、プライベートアドレス（`10/8`、`172.16/12`、`192.168/16`、`fc00::/7` など）、リンクローカルアドレス（クラウドのメタデータ用アドレス `169.254.169.254` を含む）、そのほかの予約済みアドレスへの通信は拒否します。リダイレクトでこれらに向かう場合も同じです。WebSocket と Service Worker も使えません。`ASTLIDE_ALLOW_PRIVATE_NETWORK=1` は、呼び出し元をすべて信頼でき、スライドで社内のリソースを使う必要がある場合だけ設定してください。
- Chromium がほかのホストに直接接続することはありません。通信は Astlide が代わりに行い、その応答を Chromium に渡します。接続先のアドレスは接続する時点で検査し、検査したアドレスにそのまま接続します。そのため、検査のときと接続のときで別の DNS 応答を返す手口（DNS リバインディング）は通用しません。リダイレクトも 1 回ごとに同じ検査をします。Astlide を経由しない通信は、存在しないプロキシに送られて失敗します。WebRTC が独自に UDP を送ることもできません。
- 信頼できない呼び出し元に公開する場合は、コンテナの外向き通信も制限してください。ファイアウォールやエグレスポリシーで、公開インターネットへの通信だけを許可します。

### リソースの上限

- PDF と PNG の出力では、外部リソースの取得を同時に 6 件まで、1 件 20 MB まで、合計 200 MB までに制限します。ページがデッキの外へ移動することもできないので、リロードやリダイレクトで描画内容が差し替わることはありません。
- PPTX の出力では、画像と埋め込みのプレビューで 1 つの上限を共有します。同時に 6 件まで、合計 200 MB まで、異なる URL は 200 件までです。1 件あたりの上限は画像が 20 MB、ページが 2 MB です。上限を超えた分は警告を出して取り込みません。
- 同じサイトの iframe は、1 枚のスライドにつき 32 文書までレイアウトします。ページの中に同じページを入れ子にすることはありません。
- スライドが指定する Google Fonts は、1 回のレンダリングで 12 ファミリーまでです。フォントの共有キャッシュは 512 MB 以下に保ちます。
- Chromium のレンダラープロセスは 4 つまでで、それぞれの JavaScript ヒープは 512 MB までです。Linux では、メモリが不足したときにサーバーより先にレンダリングのプロセスが強制終了されるよう設定します（`oom_score_adj`）。コンテナ自体にも上限を設定してください。

  ```bash
  docker run --memory 4g --pids-limit 512 … astlide-server
  ```

- URL のパスは 2 KB までです（超えると 414）。リクエスト本文は 60 秒以内に送り終える必要があります（超えると 408）。

### 入力の検査

- Markdown の画像は URL で指定してください。`![](../x.png)` のようにファイルパスを指定した画像は 400 で拒否します。Astro がサーバーのディスクからそのファイルを読み込んでしまうためです。`https:` か `data:` の URL を使います。
- スライドは必ず専用の frontmatter ブロックを付けてファイルに書き出します。本文が `---` で始まっていても本文として扱うので、frontmatter の検査を迂回することはできません。
- frontmatter では YAML のアンカーとエイリアス（`&a`、`*a`）を使えません。サイズは 1 スライドあたり 256 KB までです。
- アップロードされた PowerPoint ファイル（`/import`、`/templates/layouts`、`POST /templates`）は、レンダリングと同じキューに並べたうえで子プロセスで読み込みます。読み込みが `RENDER_TIMEOUT_MS` を超えると中止し（504）、結果が `MAX_OUTPUT_MB` を超えると拒否します（422）。どちらの場合もサーバー本体が止まることはありません。
- レンダリングのプロセスには、必要な環境変数だけを渡します。渡すのは `PATH`、`HOME`、一時ディレクトリ、ロケールの設定、`PLAYWRIGHT_BROWSERS_PATH` と、サーバーが指定するレンダリング用の設定（スライド数の上限、サンドボックス、通信の制限）です。サーバーの秘密情報、`ASTLIDE_API_KEY`、クラウドの認証情報、プロキシの設定は渡しません。

### Chromium のサンドボックス

- Chromium はサンドボックスの中で動きます。レンダラーに脆弱性があっても、影響はサンドボックスの中にとどまります。
- サンドボックスにはユーザー名前空間が必要です。Docker では `--security-opt seccomp=packages/server/chromium-seccomp.json` を付けてコンテナを起動します。このプロファイルは、Docker の標準プロファイルで `clone`、`clone3`、`unshare`、`setns` を許可したものです。
- ユーザー名前空間を制限している Linux ホスト（Ubuntu 24.04 など）では、AppArmor のプロファイルで Playwright の Chromium にだけ許可を与えてください（[Linux での Chromium のサンドボックス](/ja/guides/export/#linux-での-chromium-のサンドボックス)を参照）。マシン全体の制限を外すのは避けます。
- サンドボックスを起動できないとき、PDF と PNG の出力は失敗します。サンドボックスなしで続行することはありません。API の呼び出し元には短いエラーだけを返し、ホスト側で何を変えればよいかといった詳細はサーバーのログに出します。
- `ASTLIDE_CHROMIUM_SANDBOX=0` でサンドボックスを無効にできます。この場合、サーバーは起動時に警告を出します。
- seccomp プロファイルはコンテナ全体に適用されます。Bun のサーバーや、リクエストごとの Astro ビルドも対象になるため、そこで動くコードもユーザー名前空間を作れてしまいます。より厳しくするなら、レンダリングだけをプロファイル付きの専用コンテナで動かし、API サーバーはプロファイルなしの別コンテナで動かします。
