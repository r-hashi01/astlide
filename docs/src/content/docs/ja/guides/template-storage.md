---
title: テンプレートの保存先
description: レンダリングサービスの PowerPoint テンプレートを、ディレクトリ、Amazon S3（R2・MinIO を含む）、Google Cloud Storage、Azure Blob Storage に保存する方法と、それぞれのアクセス権の設定をまとめています。
---

[レンダリングサービス](/ja/guides/server/)は、PowerPoint テンプレートに名前を付けて保存できます。保存しておけば、呼び出す側は毎回ファイルを送らずに `"template": "acme"` と書くだけでレンダリングできます。このページでは、テンプレートをどこに保存するかと、保存先へのアクセスをどう許可するかを説明します。同じ保存の仕組みは、`@astlide/core/templates` から自分のプログラムでも使えます。

## 保存先を選ぶ

`ASTLIDE_TEMPLATE_STORE` に次のどれかを指定します。バケット名のあとのプレフィックスは省略できます。ほかの用途と共用しているバケットなら、プレフィックスを付けてテンプレートの置き場所を分けておくと管理しやすくなります。

| `ASTLIDE_TEMPLATE_STORE` | 保存先 |
| --- | --- |
| `/data/templates` | サーバー上のディレクトリ |
| `s3://<バケット>/<プレフィックス>` | Amazon S3。Cloudflare R2 や MinIO など、S3 互換の API を持つサービスもこちら |
| `gs://<バケット>/<プレフィックス>` | Google Cloud Storage |
| `azure://<コンテナー>/<プレフィックス>` | Azure Blob Storage |

サーバーが 1 台なら、ディレクトリがいちばん手軽です。コンテナを作り直す運用の場合や、複数のサーバーで同じテンプレートを使う場合は、バケットを選んでください。

バケットやコンテナーは事前に作っておいてください。Astlide は作成しません。サーバーは起動時に保存先の一覧を一度取得します。接続できない場合や権限がない場合はエラーを表示して停止するので、設定の誤りには最初のアップロードを待たずにデプロイの時点で気づけます。

各クラウドとのやり取りには、それぞれの公式 SDK を使っています。認証情報も、各社のツールと同じ順序で探します。そのため、IAM ロール、サービスアカウントの割り当て、マネージド ID を使えば、設定にキーを書かずに済みます。ここで使う環境変数は、スライドを描画するビルドやブラウザーのプロセスには渡しません。

Docker イメージと `@astlide/server` には、SDK が最初から入っています。自分のプログラムで使う場合は、必要な SDK をインストールしてください（[自分のプログラムから使う](#自分のプログラムから使う)を参照）。

## ディレクトリ

`ASTLIDE_TEMPLATE_STORE` にディレクトリを指定します。ディレクトリがなければサーバーが作ります。Docker では、そこにボリュームをマウントしてください。マウントしないと、コンテナを削除したときにテンプレートも消えます。イメージには、このための `/data/templates` を用意してあります。

```bash
docker run --rm -p 8787:8787 -e ASTLIDE_API_KEY \
  -e ASTLIDE_TEMPLATE_STORE=/data/templates -v astlide-templates:/data/templates \
  --security-opt seccomp=packages/server/chromium-seccomp.json astlide-server
```

## Amazon S3

```bash
-e ASTLIDE_TEMPLATE_STORE=s3://acme-assets/astlide/templates -e AWS_REGION=ap-northeast-1
```

認証情報は、AWS SDK の標準の順序で探します。AWS 上で動かすなら、サービスにロールを割り当てるだけで済み、キーの設定は要りません。ECS のタスクロール、EC2 のインスタンスプロファイル、EKS のサービスアカウント（IRSA または Pod Identity）が使えます。AWS の外で動かす場合は、`AWS_ACCESS_KEY_ID` と `AWS_SECRET_ACCESS_KEY` を設定します（一時的な認証情報なら `AWS_SESSION_TOKEN` も）。共有設定ファイルをマウントして、`AWS_PROFILE` でプロファイルを選ぶこともできます。

ロールやユーザーには、プレフィックス以下の一覧の取得と、オブジェクトの読み取り・書き込み・削除の権限が必要です。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::acme-assets",
      "Condition": { "StringLike": { "s3:prefix": "astlide/templates/*" } }
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::acme-assets/astlide/templates/*"
    }
  ]
}
```

### Cloudflare R2・MinIO など S3 互換のサービス

`s3://` を指定し、`AWS_ENDPOINT_URL_S3` にサービスの URL を設定します。エンドポイントを設定すると、Astlide はバケット名を URL のパスに入れて送ります。S3 互換のサービスはこの形式を前提にしているためです。リージョンを設定しなければ `us-east-1` を使います。

```bash
# Cloudflare R2：バケットに対して「オブジェクト読み取りと書き込み」の権限を持つ API トークン
-e ASTLIDE_TEMPLATE_STORE=s3://astlide-templates \
-e AWS_ENDPOINT_URL_S3=https://<アカウント ID>.r2.cloudflarestorage.com -e AWS_REGION=auto \
-e AWS_ACCESS_KEY_ID=<アクセスキー ID> -e AWS_SECRET_ACCESS_KEY=<シークレットアクセスキー>

# MinIO
-e ASTLIDE_TEMPLATE_STORE=s3://astlide-templates \
-e AWS_ENDPOINT_URL_S3=http://minio:9000 \
-e AWS_ACCESS_KEY_ID=<アクセスキー> -e AWS_SECRET_ACCESS_KEY=<シークレットキー>
```

## Google Cloud Storage

```bash
-e ASTLIDE_TEMPLATE_STORE=gs://acme-assets/astlide/templates
```

認証情報には、アプリケーションのデフォルト認証情報（ADC）を使います。Cloud Run、GKE（Workload Identity を使う場合）、Compute Engine では、サービスに割り当てたサービスアカウントがそのまま使われるので、追加の設定は要りません。それ以外の環境では、サービスアカウントのキー（JSON ファイル）を作ってマウントし、`GOOGLE_APPLICATION_CREDENTIALS` にそのパスを指定します。

```bash
docker run … \
  -e ASTLIDE_TEMPLATE_STORE=gs://acme-assets/astlide/templates \
  -e GOOGLE_APPLICATION_CREDENTIALS=/secrets/astlide-sa.json \
  -v "$PWD/astlide-sa.json:/secrets/astlide-sa.json:ro" astlide-server
```

手元のマシンで試すだけなら、`gcloud auth application-default login` を実行しておけば動きます。

サービスアカウントには、バケットに対する「Storage オブジェクト ユーザー」ロールを付けます。このロールで、オブジェクトの読み取り・書き込み・削除・一覧の取得がすべてできます。

```bash
gcloud storage buckets add-iam-policy-binding gs://acme-assets \
  --member=serviceAccount:astlide@<プロジェクト>.iam.gserviceaccount.com \
  --role=roles/storage.objectUser
```

fake-gcs-server などのエミュレーターで試すときは、`STORAGE_EMULATOR_HOST` にエミュレーターの URL を指定します。

## Azure Blob Storage

```bash
-e ASTLIDE_TEMPLATE_STORE=azure://templates/astlide -e AZURE_STORAGE_ACCOUNT=acmeassets
```

`azure://` の直後に書くのはコンテナー名です。認証には、次の表の上から順に、設定されているものを使います。

| 設定する環境変数 | 認証方法 |
| --- | --- |
| `AZURE_STORAGE_CONNECTION_STRING` | ストレージアカウントの接続文字列です（ポータルの「アクセス キー」で確認できます）。`AZURE_STORAGE_ACCOUNT` は要りません。 |
| `AZURE_STORAGE_ACCOUNT` と `AZURE_STORAGE_KEY` | アカウント名と、アカウントのアクセスキーのどちらか 1 つです。 |
| `AZURE_STORAGE_ACCOUNT` と `AZURE_STORAGE_SAS_TOKEN` | コンテナーの SAS トークンです。読み取り・作成・書き込み・削除・一覧（`rcwdl`）の権限を付けて発行してください。 |
| `AZURE_STORAGE_ACCOUNT` だけ | Microsoft Entra ID で認証します（`DefaultAzureCredential`）。 |

Entra ID を使えば、キーを一切扱わずに済みます。Azure Container Apps、App Service、AKS（ワークロード ID を使う場合）、仮想マシンでは、マネージド ID がそのまま使われます。それ以外の環境では、サービスプリンシパルを `AZURE_TENANT_ID`・`AZURE_CLIENT_ID`・`AZURE_CLIENT_SECRET` に設定します。手元のマシンなら `az login` でサインインしておけば動きます。使う ID には、コンテナーに対する「ストレージ BLOB データ共同作成者」ロールを付けてください。

```bash
az role assignment create --assignee <ID のクライアント ID> \
  --role "Storage Blob Data Contributor" \
  --scope /subscriptions/<サブスクリプション>/resourceGroups/<リソースグループ>/providers/Microsoft.Storage/storageAccounts/acmeassets/blobServices/default/containers/templates
```

Azurite や、Azure Government などのソブリンクラウドを使う場合は、`AZURE_STORAGE_BLOB_ENDPOINT` に Blob のエンドポイントを指定します。Azurite なら `http://127.0.0.1:10000/devstoreaccount1` です。

## 自分のプログラムから使う

レンダリングサービスが使っている保存の仕組みは、`@astlide/core/templates` として公開しています。`openTemplateStore()` には、`ASTLIDE_TEMPLATE_STORE` と同じ形式の値を渡します。

```ts
import { openTemplateStore } from "@astlide/core/templates";

const store = openTemplateStore("gs://acme-assets/astlide/templates");
await store.put("acme", await readFile("acme.potx"), { ext: ".potx", label: "Acme 2026" });
await store.list();          // すべてのテンプレートと、それぞれの版
await store.get("acme");     // 最新の版とそのファイル
await store.get("acme", 1);  // 版 1
await store.remove("acme");  // すべての版を削除
```

使う保存先に応じて、SDK をインストールしてください。S3 なら `bun add @aws-sdk/client-s3`、Cloud Storage なら `bun add @google-cloud/storage`、Azure なら `bun add @azure/storage-blob` です。Azure で Entra ID を使う場合は `@azure/identity` も必要です。SDK が入っていないときは、どのパッケージを追加すればよいかをエラーで知らせます。

リトライの設定を変えたいときなど、自分で作ったクライアントを使いたい場合は、保存先ごとの関数で作ります。

```ts
import { S3Client } from "@aws-sdk/client-s3";
import { createS3TemplateStore } from "@astlide/core/templates";

const store = createS3TemplateStore({
  bucket: "acme-assets",
  prefix: "astlide/templates",
  client: new S3Client({ region: "ap-northeast-1", maxAttempts: 5 }),
});
```

Cloud Storage なら `createGcsTemplateStore({ bucket, prefix, storage })`、Azure なら `createAzureBlobTemplateStore({ container, prefix, client })` で、同じように作れます。

ほかのストレージに保存したい場合は、`ObjectStorage` を実装します。キーを指定してオブジェクトを読む・書く・消す・一覧する、の 4 つだけを用意すれば、版の管理は `createObjectTemplateStore()` が引き受けます。

```ts
import { createObjectTemplateStore, type ObjectStorage } from "@astlide/core/templates";

const storage: ObjectStorage = {
  read: async (key) => /* オブジェクトの中身。なければ undefined */,
  write: async (key, data) => { /* オブジェクト全体を一度に保存する */ },
  delete: async (key) => { /* 削除する。なくてもエラーにしない */ },
  list: async (prefix) => /* prefix で始まるすべてのキー */,
};
const store = createObjectTemplateStore(storage);
```

## 保存される形

プレフィックスの下に、テンプレートの名前ごとの階層を作ります。その中に、ラベルと版の一覧を記録した `manifest.json` と、アップロードされたままの版ごとのファイルを置きます。

```
astlide/templates/
├── acme/
│   ├── manifest.json
│   ├── v1.potx
│   └── v3.potx
└── brand/
    ├── manifest.json
    └── v1.pptx
```

バックアップや別のストレージへの移行は、プレフィックス以下をまるごとコピーすれば済みます。テンプレートの変更は API から行い、これらのファイルを直接編集しないでください。

レンダリングだけなら、何台のサーバーから同じ保存先を使ってもかまいません。ただし、テンプレートの追加と削除を行うサーバーは 1 台にしてください。サーバー間でのロックはないので、同じテンプレートに 2 台が同時にアップロードすると、`manifest.json` を互いに上書きしてしまうおそれがあります。
