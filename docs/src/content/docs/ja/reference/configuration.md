---
title: 設定
description: astlide() インテグレーションのオプションと、デッキの _config.json の項目一覧です。
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
      notes: "dev",
    }),
  ],
});
```

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `toolbar` | `ToolbarItem[]` | `["prev", "counter", "next"]` | ツールバーに並べるボタンを、表示する順に指定します。[プレゼンテーション](/ja/guides/presenting/#ツールバー)を参照してください。 |
| `slideDecorators` | `string[]` | `[]` | すべてのスライドに表示するコンポーネント。モジュール指定子で書きます。 |
| `plugins` | `AstlidePlugin[]` | `[]` | テーマ、レイアウト、トランジション、Shiki の言語とテーマ、デコレーターを追加します。[プラグイン API](/ja/guides/themes-and-plugins/#プラグイン-api) を参照してください。 |
| `shikiTheme` | `string` | `"github-dark"` | コードフェンスの配色に使う Shiki のテーマ。 |
| `font` | `false \| string \| { href?, preconnect? }` | Google Fonts の Inter + JetBrains Mono | 読み込む Web フォントのスタイルシート。`false` にすると何も読み込みません。 |
| `favicon` | `string \| false` | 自動 | デッキのページと一覧ページのファビコン。デフォルトでは、`public/` に `favicon.svg` / `.ico` / `.png` があればそれを使います。なければ空のアイコンを使うので、ドメイン直下の `/favicon.ico` へのリクエストは発生しません。ルート相対パスを指定すると Astro の `base` が付きます。`false` にするとアイコンのリンクを出力しません。 |
| `csp` | `boolean \| string` | `true` | `true` でデフォルトの Content-Security-Policy を meta タグで入れます。`false` で無効になり、文字列を渡すと独自のポリシーになります。meta タグを入れるのはスライドのページ、`/[deck]/all`、一覧ページで、ポリシーには `base-uri 'self'; form-action 'self'; object-src 'none'` が入ります。ビルド時のデフォルトのポリシーでは、`script-src` に `'unsafe-inline'` を含めません。Astlide と Astro がページに入れるインラインスクリプトは、SHA-256 のハッシュで許可します。MDX のスライドとそのコンポーネントのスクリプトも、コードの一部なので同じ扱いです。ハッシュは `astro build` のあとに追加します。Markdown・HTML・PowerPoint のスライドにあるインラインスクリプトは動きません（`slideScripts` を参照）。インラインのイベントハンドラー属性（`onclick="…"`）と `javascript:` URL も動きません。`style-src` には `'unsafe-inline'` を残します。スライドが `style` 属性を使うためです。`astro dev` では、スクリプトは `'unsafe-inline'` のままです。また、Vite のクライアントのために `worker-src 'self' blob:` を追加します（すでに指定があれば追加しません）。独自のポリシー文字列は、手を加えずにそのまま使います。[埋め込みの制限とヘッダー](#埋め込みの制限とヘッダー)も参照してください。 |
| `indexable` | `boolean` | `false` | `false` のとき、ページに `noindex, nofollow` を付けます。 |
| `injectIndexRoute` | `boolean` | 自動 | `/` にデッキの一覧ページを追加します。自前の `src/pages/index.*` があるときは追加しません。 |
| `drawings.persist` | `boolean` | `false` | ペンで描いた内容を `localStorage` に保存し、再読み込みしても消えないようにします。[プレゼンテーション](/ja/guides/presenting/#描画を残す)を参照してください。 |
| `notes` | `"public" \| "dev"` | `"dev"` | 発表者ノートをどこに含めるか。`"dev"` では、`astro dev` と、`astlide export` が行うビルドにだけ含めます（PowerPoint に書き出すとノートが入ります）。`astro build` でビルドしたページには入りません。`"public"` ではすべてのページに含めます。URL を知っていれば誰でも読めるので注意してください。[発表者ノート](/ja/guides/decks/#発表者ノート)を参照してください。 |
| `slideScripts` | `boolean` | `false` | Markdown・HTML・PowerPoint のスライドにある `<script>`、インラインのイベントハンドラー、`javascript:` URL を実行するかどうか。`astro dev` とビルドの両方に効きます。オフのときは、スライドの描画時に取り除きます。スライドの内容は他人が書いたものかもしれません。また `astro dev` では、スクリプトがスライドエディターと同じページで動いてしまいます。MDX のスライドのスクリプトは、この設定に関係なく常に動きます。オンにするのは、内容を完全に信頼できるデッキだけにしてください。 |

Astro 本体の [`base`](/ja/guides/deploy/) オプションも反映します。

### 埋め込みの制限とヘッダー

デッキを `<iframe>` に埋め込めるサイトを制限する `frame-ancestors` は、`<meta>` の CSP では指定できません。何もしなければ、どのサイトからでも埋め込めます。ホスティング先でレスポンスヘッダーを設定できるなら、ヘッダーで指定してください。たとえば `Content-Security-Policy: frame-ancestors 'self' https://your-site.example` のように書きます。

- **Netlify**: `public/_headers` に `/*` と書き、次の行に `  Content-Security-Policy: frame-ancestors 'self'` と書く
- **Cloudflare Pages**: Netlify と同じ `public/_headers` を使う
- **Vercel**: `vercel.json` に `"headers": [{ "source": "/(.*)", "headers": [{ "key": "Content-Security-Policy", "value": "frame-ancestors 'self'" }] }]`

GitHub Pages ではヘッダーを設定できません。[`<astlide-deck>`](/ja/guides/embed/) でデッキを埋め込むサイトがあれば、そのサイトも許可に加えてください。

## デッキの `_config.json`

| フィールド | 型 | デフォルト | 説明 |
|---|---|---|---|
| `title` | `string` | フォルダー名 | デッキ一覧とブラウザのタブに表示します。 |
| `author` | `string` | — | デッキ一覧に表示します。 |
| `date` | `string` | — | ISO 形式の日付。デッキ一覧に表示します。 |
| `theme` | `string` | `"default"` | テーマ名。組み込みテーマとプラグインのテーマを指定できます。 |

## パッケージのエントリーポイント

| import | 内容 |
|---|---|
| `@astlide/core` | インテグレーション（デフォルトエクスポート）、`astlideDeckLoader`、`slideSchema`、`deckConfigSchema`、`THEMES`、`defineAstlidePlugin`、コンテキストのヘルパー |
| `@astlide/core/plugin` | `defineAstlidePlugin` とプラグインの型 |
| `@astlide/core/context` | `getDeckContext`、`getClientDeckContext` |
| `@astlide/core/utils/code-highlight` | Shiki トランスフォーマー `astlideCodeHighlight` |
| `@astlide/core/utils/mermaid` | Shiki トランスフォーマー `astlideMermaid` |

API の詳細は [TypeDoc リファレンス](https://astlide.dev/api/)を参照してください。
