---
title: 設定
description: astlide() インテグレーションの全オプション、デッキごとの _config.json の項目、パッケージのエントリーポイントをまとめています。
---

設定を書く場所は 2 つあります。サイト全体に効く設定は、`astro.config.mjs` の `astlide()` に渡します。デッキごとの設定は、そのデッキの `_config.json` に書きます。

## インテグレーションのオプション

オプションはすべて省略できます。下の例は、全オプションをデフォルト値で書いたものです。

```js
// astro.config.mjs
import astlide from "@astlide/core";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    astlide({
      toolbar: ["prev", "counter", "next"],
      slideDecorators: [],
      plugins: [],
      templates: {},
      shikiTheme: "github-dark",
      font: undefined, // Inter + JetBrains Mono from Google Fonts
      favicon: undefined, // favicon.* from public/, if there is one
      csp: true,
      slideScripts: false,
      indexable: false,
      injectIndexRoute: undefined, // added unless you have src/pages/index.*
      drawings: { persist: false },
      notes: "dev",
    }),
  ],
});
```

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `toolbar` | `ToolbarItem[]` | `["prev", "counter", "next"]` | ツールバーに置くボタンを、左から順に並べます。使えるボタンは[プレゼンテーション](/ja/guides/presenting/#ツールバー)に一覧があります。 |
| `slideDecorators` | `string[]` | `[]` | ロゴやフッターなど、全スライドに出すコンポーネントです。`"./src/components/DeckFooter.astro"` のように、モジュールのパスで指定します。 |
| `plugins` | `AstlidePlugin[]` | `[]` | テーマ、レイアウト、トランジション、Shiki の言語とテーマ、デコレーターを追加するプラグインです。[プラグイン API](/ja/guides/themes-and-plugins/#プラグイン-api) を参照してください。 |
| `templates` | `Record<string, string> \| string \| TemplateStore` | `{}` | テーマとして使う PowerPoint テンプレートです。テーマ名をキーにして、`.pptx`・`.potx`・`.thmx` ファイルのパス（プロジェクトからの相対パス）を書きます。使うときは、そのテーマ名を `_config.json` の `theme` に指定します。[テンプレートの保存先](/ja/guides/template-storage/)（フォルダー、`s3://`・`gs://`・`azure://` の場所、または `TemplateStore`）を指定すると、保存先のテンプレートがすべて、それぞれの名前のテーマになります。詳しくは [PowerPoint テンプレート](/ja/guides/templates/)を参照してください。 |
| `shikiTheme` | `string` | `"github-dark"` | コードブロックの配色に使う Shiki のテーマです。 |
| `font` | `false \| string \| { href?, preconnect? }` | Google Fonts の Inter と JetBrains Mono | 読み込む Web フォントのスタイルシートです。文字列で URL を渡すと、そのオリジンへの preconnect も自動で入ります。preconnect 先を自分で決めたいときはオブジェクトで渡します。`false` にすると、フォントのスタイルシートを読み込みません。 |
| `favicon` | `string \| false` | 説明を参照 | スライドのページとデッキ一覧のファビコンです。省略すると、`public/` にある `favicon.svg`・`favicon.ico`・`favicon.png` を使います。どれもなければ空のアイコンを設定します。これで、ブラウザがドメイン直下の `/favicon.ico` を取りに行かずに済みます。`/` で始まるパスには Astro の `base` を付けます。`false` にすると、ファビコンのリンクを出力しません。 |
| `csp` | `boolean \| string` | `true` | `true` のときは、Astlide が用意した Content-Security-Policy を `<meta>` タグで入れます。文字列を渡すと、そのポリシーに置き換わります。`false` では何も入れません。詳しくは [Content-Security-Policy](#content-security-policy) を参照してください。 |
| `slideScripts` | `boolean` | `false` | Markdown・HTML・PowerPoint のスライドで、`<script>` タグ、インラインのイベントハンドラー（`onclick="…"`）、`javascript:` URL を動かすかどうかです。詳しくは[スライド内のスクリプト](#スライド内のスクリプト)を参照してください。 |
| `indexable` | `boolean` | `false` | 検索エンジンにページを登録させるかどうかです。`false` の間は、全ページに `<meta name="robots" content="noindex, nofollow">` が入ります。 |
| `injectIndexRoute` | `boolean` | 説明を参照 | `/` にデッキ一覧のページを置くかどうかです。省略した場合は、`src/pages/index.astro`（`.md`・`.mdx`・`.html` も同様）が自前にないときだけ置きます。`true` なら常に置き、`false` なら置きません。 |
| `drawings.persist` | `boolean` | `false` | ペンで描いた内容をブラウザの `localStorage` に保存します。再読み込みしても描画が残ります。[プレゼンテーション](/ja/guides/presenting/#描画を残す)を参照してください。 |
| `notes` | `"dev" \| "public"` | `"dev"` | 発表者ノートをどのページに含めるかを決めます。`"dev"` では、開発サーバーと `astlide export` のビルドにだけ含めます。そのため PowerPoint に書き出したファイルにはノートが残ります。`astro build` で作ったページには含めません。`"public"` では全ページに含めます。この場合、URL を知っている人は誰でもノートを読めます。[発表者ノート](/ja/guides/decks/#発表者ノート)を参照してください。 |

Astro の [`base`](/ja/guides/deploy/) オプションにも従います。

### Content-Security-Policy

`csp: true` のときは、スライドのページ、`/[deck]/all`、デッキ一覧に CSP の `<meta>` タグが入ります。ポリシーには `base-uri 'self'; form-action 'self'; object-src 'none'` が含まれます。

ビルドしたページでは、`script-src` に `'unsafe-inline'` を入れません。代わりに、`astro build` の後で、動かしてよいインラインスクリプトの SHA-256 ハッシュを追加します。対象は次の 2 つです。

- Astlide と Astro がページに入れるスクリプト
- MDX のスライドと、そこで使うコンポーネントのスクリプト

Markdown・HTML・PowerPoint のスライドにあるインラインスクリプトにはハッシュを付けません。これらが動くのは、`slideScripts` を有効にしたときだけです。インラインのイベントハンドラーと `javascript:` URL は動きません。`style-src` には `'unsafe-inline'` を残しています。スライドで `style` 属性を使うためです。

開発サーバーでは、`script-src` は `'unsafe-inline'` のままです。Vite のクライアント用に `worker-src 'self' blob:` も追加します。ただし、ポリシーに `worker-src` がすでにあれば追加しません。

自分で書いたポリシー文字列は、Astlide が手を加えずにそのまま使います。

### スライド内のスクリプト

Markdown・HTML・PowerPoint のスライドから、Astlide はデフォルトで `<script>` タグ、インラインのイベントハンドラー、`javascript:` URL を取り除いてからレンダリングします。こうしたスライドは、取り込んだ `.pptx` や人から受け取った HTML など、他人が書いた内容であることがあるからです。開発サーバーでは、スライドのスクリプトがスライドエディターと同じページで動いてしまう問題もあります。

`slideScripts: true` にすると取り除かなくなり、開発サーバーでもビルドでもスクリプトが動きます。有効にするのは、内容を完全に信頼できるデッキに限ってください。スライドにスクリプトが必要なら、MDX のスライドかコンポーネントに書くほうが安全です。MDX のスライドのスクリプトは、この設定に関係なく常に動きます。

### iframe での埋め込みを制限する

どのサイトがデッキを `<iframe>` で表示してよいかは、`frame-ancestors` で決めます。ただし `<meta>` タグの CSP では `frame-ancestors` を指定できません。指定がなければ、どのサイトからでもデッキを埋め込めます。ホスティング先でレスポンスヘッダーを設定できる場合は、ヘッダーで指定してください。たとえば `Content-Security-Policy: frame-ancestors 'self' https://your-site.example` のように書きます。

- **Netlify**: `public/_headers` の 1 行目に `/*`、次の行に `  Content-Security-Policy: frame-ancestors 'self'` と書きます。
- **Cloudflare Pages**: Netlify と同じ `public/_headers` を使います。
- **Vercel**: `vercel.json` に `"headers": [{ "source": "/(.*)", "headers": [{ "key": "Content-Security-Policy", "value": "frame-ancestors 'self'" }] }]` を追加します。

GitHub Pages では、レスポンスヘッダーを設定できません。

[`<astlide-deck>`](/ja/guides/embed/) でデッキを表示しているサイトがあれば、そのサイトも `frame-ancestors` に加えてください。

## デッキの `_config.json`

`_config.json` は、デッキのフォルダーにスライドと並べて置きます。項目はすべて省略できます。

```json
{ "title": "My Talk", "author": "Alice", "date": "2025-06-01", "theme": "dark" }
```

| 項目 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `title` | `string` | フォルダー名 | デッキ一覧とブラウザのタブに表示します。 |
| `author` | `string` | なし | デッキ一覧に表示します。 |
| `date` | `string` | なし | `"2025-06-01"` のような日付です。デッキ一覧に表示します。日付として解釈できない値は表示しません。 |
| `theme` | `string` | `"default"` | デッキ全体のテーマです。組み込みのテーマ、プラグインのテーマ、`templates` で付けた名前のどれかを指定します。 |

`_config.json` が JSON として正しくない場合や、項目の型が違う場合は、デフォルト値でデッキを表示します。開発サーバーでは、スライド上にエラーが出ます。

## パッケージのエントリーポイント

| import 先 | 含まれるもの |
|---|---|
| `@astlide/core` | インテグレーション本体（デフォルトエクスポート）、`astlideDeckLoader`、`slideSchema`、`deckConfigSchema`、`THEMES`、`defineAstlidePlugin`、`getDeckContext`、`getClientDeckContext` |
| `@astlide/core/loader` | `astlideDeckLoader` |
| `@astlide/core/schema` | `slideSchema`、`deckConfigSchema`、`THEMES` |
| `@astlide/core/plugin` | `defineAstlidePlugin` とプラグインの型 |
| `@astlide/core/context` | `getDeckContext`、`getClientDeckContext` |
| `@astlide/core/embed` | カスタム要素 `<astlide-deck>`（`defineAstlideDeck`、`AstlideDeckElement`） |
| `@astlide/core/embed/react` | React コンポーネント `AstlideDeck` |
| `@astlide/core/embed/vue` | Vue コンポーネント `AstlideDeck` |
| `@astlide/core/pptx` | PowerPoint をスライドに変換する `pptxToSlides` と、`pptxToTemplate` |
| `@astlide/core/mcp` | `astlide mcp` の MCP サーバー（`createServer`）と、`checkDeck`・`importPptx`・`renderDeck` などのツール関数 |
| `@astlide/core/engine` | PPTX の書き出しと `check_deck` が使うレイアウトエンジン |
| `@astlide/core/utils/base-path` | `withBase` など、Astro の `base` を考慮してリンクを組み立てるヘルパー |
| `@astlide/core/utils/code-highlight` | Shiki のトランスフォーマー `astlideCodeHighlight` |
| `@astlide/core/utils/mermaid` | Shiki のトランスフォーマー `astlideMermaid` |

エクスポートと型の一覧は [API リファレンス](https://astlide.dev/api/)にあります。
