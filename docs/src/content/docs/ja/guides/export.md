---
title: エクスポート
description: デッキを PDF、PNG、PowerPoint に書き出します。
---

## コマンド 1 つで書き出す

```bash
bunx astlide export my-talk                 # → exports/my-talk.pdf
bunx astlide export my-talk --pptx          # → exports/my-talk.pptx (editable PowerPoint)
bunx astlide export my-talk --png           # → exports/my-talk-slides/*.png
bunx astlide export --all --pdf --pptx      # every deck, both formats
```

`bun create astlide` で作成したプロジェクトでは、スクリプトとしても使えます: `bun run export my-talk --pptx`

デッキはパス（`src/content/decks/my-talk`、`dist/my-talk` など）でも指定できます。プロジェクトはそのパスから探索されます。プロジェクト内のどのフォルダでコマンドを実行した場合も同様です。

- **PDF / PNG** はヘッドレスブラウザで描画します（[Playwright](https://playwright.dev) を使います。最初に一度 `bunx playwright install chromium` を実行してください）。`astlide export` がサイトをビルドし、空いているポートで配信してから書き出すので、サーバーを起動しておく必要はありません。Astro の [`base`](/astlide/ja/guides/deploy/) も自動的に反映されます。各スライドは最終状態（フラグメントとコードのステップをすべて適用した状態）で出力され、図の描画が終わるのを待ってから書き出されます。
- **PPTX** はブラウザを必要としません。ビルドしたスライドを Astlide 独自の CSS レイアウトエンジンでレイアウトし、ネイティブの図形と編集可能なテキストボックスとして書き出します。テーマが読み込むフォントはファイルに埋め込まれるので、フォントがインストールされていない環境の PowerPoint でも同じフォントで表示されます（ライセンスで埋め込みが禁止されているフォントは除外されます）。表は PowerPoint の表に、ボックス、CSS の `::before` / `::after` のテキスト、単純なインライン SVG の図（四角形、円、線と矢印、パス、テキスト）は編集可能な図形になります。Mermaid の図もブラウザなしで（プロジェクトにインストールされた `mermaid` で）描画して画像として配置します。それ以上の要素（グラデーション、円弧など）を使う SVG の図も画像になります。PNG と SVG の画像はそのまま含まれます。

| オプション | |
|---|---|
| `--pdf` `--pptx` `--png` | 出力形式。組み合わせて指定できます（デフォルト `--pdf`） |
| `--all` | すべてのデッキ |
| `--out-dir <dir>` | 出力先（デフォルト `exports/`） |
| `-o, --output <path>` | 出力パスを直接指定（デッキ 1 つ、形式 1 つの場合） |
| `--no-build` | ビルドせず既存の `dist/` を使う |
| `--base-url <url>` | PDF / PNG: 起動済みの開発 / プレビューサーバーから描画する（`base` を含めて指定。例: `http://localhost:4321/my-repo`） |
| `--width` / `--height` | PDF / PNG: スライドのサイズ（px、デフォルト 1920×1080） |

同じプロジェクトで `astro dev` を実行している場合は、`--base-url` を指定してください。PDF / PNG のエクスポートが開発サーバーと並行してビルドを行わずに済みます。

## 日本語のフォント

日本語のスライドを PPTX に書き出すときのフォントの扱いは次のとおりです。

- **PowerPoint で使われるフォント** — テキストには東アジア言語用のフォントが設定されます。スライドの CSS に CJK フォント（Noto Sans JP など）が指定されていればそのフォントを、なければ Office に同梱されている游ゴシック（Yu Gothic）を使います。
- **改行位置の計算** — 日本語のテキストは、CSS の CJK フォントが読み込まれていればそのフォントで、なければ Google Fonts の Noto Sans JP で幅を測ってレイアウトします。そのため、行の折り返し位置がブラウザでの表示とほぼ同じになります。

ブラウザ、PDF、PPTX で見た目をそろえるには、テーマで日本語の Web フォントを指定しておくのがおすすめです。`font` オプションで読み込み、[カスタムテーマ](/astlide/ja/guides/themes-and-plugins/#カスタムテーマ)でフォントの指定に加えます。

```js
// astro.config.mjs
astlide({
  font: "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Noto+Sans+JP:wght@400;700&family=JetBrains+Mono&display=swap",
});
```

```css
/* themes/my-theme.css */
[data-theme="my-theme"] {
  --font-body: "Inter", "Noto Sans JP", sans-serif;
  --font-heading: "Inter", "Noto Sans JP", sans-serif;
}
```

テーマが読み込んだフォントは PPTX に埋め込まれるので、Noto Sans JP がインストールされていない PC の PowerPoint でも同じフォントで表示されます。

## ブラウザ内での PDF 生成（実験的機能）

[ツールバー](/astlide/ja/guides/presenting/#ツールバー)に `"download"` を追加すると、表示中のデッキをワンクリックで PDF にできます。これはオプションで 1.0 未満の [`@astlide/crispdf`](https://www.npmjs.com/package/@astlide/crispdf) を使っており、出力が今後変わる可能性があります。安定した結果が必要な場合は CLI を使ってください。

```bash
bun add -D @astlide/crispdf
```
