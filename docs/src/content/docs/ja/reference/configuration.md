---
title: 設定
description: astlide() インテグレーションのオプションと、デッキの _config.json。
---

## インテグレーションのオプション

```js
// astro.config.mjs
import astlide from "@astlide/core";

export default defineConfig({
  integrations: [
    astlide({
      toolbar: ["prev", "counter", "next"],
      slideDecorators: [],
      plugins: [],
      shikiTheme: "github-dark",
      font: undefined,
      csp: true,
      indexable: false,
      injectIndexRoute: undefined,
      drawings: { persist: false },
      notes: "public",
    }),
  ],
});
```

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `toolbar` | `ToolbarItem[]` | `["prev", "counter", "next"]` | ツールバーのアクションを並べたリスト。[プレゼンテーション](/ja/guides/presenting/#ツールバー)を参照してください。 |
| `slideDecorators` | `string[]` | `[]` | すべてのスライドに描画するコンポーネント（モジュール指定子）。 |
| `plugins` | `AstlidePlugin[]` | `[]` | テーマ、レイアウト、トランジション、Shiki の言語 / テーマ、デコレーター。[プラグイン API](/ja/guides/themes-and-plugins/#プラグイン-api) を参照してください。 |
| `shikiTheme` | `string` | `"github-dark"` | コードフェンスに使う Shiki のテーマ。 |
| `font` | `false \| string \| { href?, preconnect? }` | Google Fonts の Inter + JetBrains Mono | 読み込む Web フォントのスタイルシート。`false` で読み込みません。 |
| `favicon` | `string \| false` | 自動 | デッキのページと一覧ページのファビコン。デフォルトでは `public/` に `favicon.svg` / `.ico` / `.png` があればそれを使い、なければ空のアイコンを使います（ドメイン直下の `/favicon.ico` へのリクエストは発生しません）。ルート相対パスには Astro の `base` が付きます。`false` でアイコンのリンクを出力しません。 |
| `csp` | `boolean \| string` | `true` | デフォルトの Content-Security-Policy の meta タグ（スライドのページ、`/[deck]/all`、一覧ページに入り、`base-uri 'self'; form-action 'self'; object-src 'none'` を含みます）を挿入するか、無効にするか、独自のポリシーを指定します。ビルドでは、デフォルトのポリシーの `script-src` に `'unsafe-inline'` を含めません。Astlide と Astro がページに入れるインラインスクリプトと、MDX のスライドやそのコンポーネントのスクリプト（どちらもコードです）は、`astro build` のあとに追加する SHA-256 のハッシュで許可します。Markdown・HTML・PowerPoint のスライドに書かれたインラインスクリプトは動きません（`slideScripts` を参照）。インラインのイベントハンドラー属性（`onclick="…"`）と `javascript:` URL も動きません。`style-src` には `'unsafe-inline'` を残します（スライドが `style` 属性を使うため）。`astro dev` ではスクリプトは `'unsafe-inline'` のままで、Vite のクライアント用に `worker-src 'self' blob:` が（指定がなければ）追加されます。独自のポリシー文字列を指定した場合は、そのまま使います。[埋め込みの制限とヘッダー](#埋め込みの制限とヘッダー)も参照してください。 |
| `slideScripts` | `boolean` | `false` | Markdown・HTML・PowerPoint のスライドに書かれたインラインの `<script>` を、ビルドしたページでも動かします（そのハッシュをデフォルトの CSP に加えます）。既定はオフです。こうした内容は他人から来ることがあり（取り込んだ `.pptx`、もらった HTML スライドなど）、紛れ込んだスクリプトを止めるのが CSP の役目だからです。内容を完全に信頼できるデッキでだけ有効にしてください。自分のスライドでスクリプトを使うなら、MDX のスライドかコンポーネントにするのがおすすめです。スライドのスクリプトを除外したときは、ビルド時に警告を出します。 |
| `indexable` | `boolean` | `false` | `false` の場合、ページに `noindex, nofollow` が付きます。 |
| `injectIndexRoute` | `boolean` | 自動 | `/` にデッキの一覧を挿入します。独自の `src/pages/index.*` がある場合は自動的にスキップされます。 |
| `drawings.persist` | `boolean` | `false` | ペンの描画を `localStorage` に保存し、再読み込み後も残します。[プレゼンテーション](/ja/guides/presenting/#描画を残す)を参照してください。 |
| `notes` | `"public" \| "dev"` | `"public"` | スピーカーノートをどこに含めるか。`"public"` はすべてのページに含めるので、URL を知っている人なら誰でも読めます。`"dev"` は `astro dev` のときだけ含め、ビルドしたページ（とそこから作るエクスポート）には含めません。[スピーカーノート](/ja/guides/decks/#スピーカーノート)を参照してください。 |

Astro 自体の [`base`](/ja/guides/deploy/) オプションにも従います。

### 埋め込みの制限とヘッダー

`<meta>` の CSP では、デッキを `<iframe>` で埋め込めるサイトを指定できません（`frame-ancestors`）。そのため、どのサイトからでも埋め込めます。ホスティング先でレスポンスヘッダーを設定できるなら、そこで指定してください。たとえば `Content-Security-Policy: frame-ancestors 'self' https://your-site.example` です。

- **Netlify** — `public/_headers` に `/*` と `  Content-Security-Policy: frame-ancestors 'self'` を書く
- **Cloudflare Pages** — 同じ `public/_headers` ファイル
- **Vercel** — `vercel.json` に `"headers": [{ "source": "/(.*)", "headers": [{ "key": "Content-Security-Policy", "value": "frame-ancestors 'self'" }] }]`

GitHub Pages ではヘッダーを設定できません。[`<astlide-deck>`](/ja/guides/embed/) でデッキを埋め込むサイトは、許可に含めてください。

## デッキの `_config.json`

| フィールド | 型 | デフォルト | 説明 |
|---|---|---|---|
| `title` | `string` | フォルダ名 | デッキ一覧とブラウザのタブに表示されます。 |
| `author` | `string` | — | デッキ一覧に表示されます。 |
| `date` | `string` | — | デッキ一覧に表示される ISO 形式の日付。 |
| `theme` | `string` | `"default"` | 組み込みテーマまたはプラグインのテーマの名前。 |

## パッケージのエントリーポイント

| import | 内容 |
|---|---|
| `@astlide/core` | インテグレーション（デフォルトエクスポート）、`astlideDeckLoader`、`slideSchema`、`deckConfigSchema`、`THEMES`、`defineAstlidePlugin`、コンテキストのヘルパー |
| `@astlide/core/plugin` | `defineAstlidePlugin` とプラグインの型 |
| `@astlide/core/context` | `getDeckContext`、`getClientDeckContext` |
| `@astlide/core/utils/code-highlight` | Shiki トランスフォーマー `astlideCodeHighlight` |
| `@astlide/core/utils/mermaid` | Shiki トランスフォーマー `astlideMermaid` |

API の詳細: [TypeDoc リファレンス](https://astlide.dev/api/)
