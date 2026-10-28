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

`bun create astlide` で作ったプロジェクトには、同じコマンドが `package.json` のスクリプトとして入っています（`bun run export my-talk --pptx`）。

デッキはパスでも指定できます（`src/content/decks/my-talk`、`dist/my-talk` など）。その場合はパスからプロジェクトを探します。プロジェクト内のどのフォルダーでコマンドを実行しても、同じようにプロジェクトを見つけます。

- **PDF / PNG** は、[Playwright](https://playwright.dev) のヘッドレスブラウザで描画します。最初に一度だけ `bunx playwright install chromium` を実行してください。`astlide export` はサイトをビルドし、空いているポートで配信してから書き出します。自分でサーバーを起動しておく必要はありません。Astro の [`base`](/ja/guides/deploy/) も自動で反映します。スライドは段階表示とコードのステップをすべて進めた状態で出力します。図は描画が終わるのを待ってから書き出します。

  描画中も Chromium のサンドボックスは有効です。Linux でサンドボックスを使うには、特権なしのユーザー名前空間が必要です。Ubuntu 24.04 や多くのコンテナのように、これが制限されている環境では書き出しが止まり、Chromium にだけ許可する方法を表示します（[Linux での Chromium のサンドボックス](#linux-での-chromium-のサンドボックス)を参照）。`ASTLIDE_CHROMIUM_SANDBOX=0` でサンドボックスを無効にもできます。ただし、内容を信頼できるデッキに限ってください。
- **PPTX** の書き出しにブラウザは要りません。ビルドしたスライドを Astlide 独自の CSS レイアウトエンジンで配置し、PowerPoint の図形と編集できるテキストボックスとして書き出します。テーマが読み込むフォントはファイルに埋め込むので、そのフォントが入っていない PC の PowerPoint でも同じフォントで表示されます。ライセンスで埋め込みが禁止されているフォントは埋め込みません。

  表は PowerPoint の表になります。ボックス、CSS の `::before` / `::after` で入れたテキスト、単純なインライン SVG の図（四角形、円、線と矢印、パス、テキスト）は、編集できる図形になります。Mermaid の図は、プロジェクトにインストールされた `mermaid` を使ってブラウザなしで描画し、画像として配置します。グラデーションや円弧など、それ以外の要素を含む SVG の図も画像になります。PNG と SVG の画像はそのまま入ります。発表者ノートは PowerPoint のノート欄に入ります。日本語のテキストの扱いは[日本語のフォント](#日本語のフォント)で説明します。

書き出しには専用のビルドを使います。出力先は `dist/` とは別の `node_modules/.astro/astlide-export` です。このビルドには、[`notes` オプション](/ja/guides/decks/#発表者ノート)の設定に関係なく発表者ノートが入ります（PPTX のノート欄に使うためです）。デプロイする `dist/` はそのまま残ります。

| オプション | |
|---|---|
| `--pdf` `--pptx` `--png` | 出力形式。複数を同時に指定できます（デフォルトは `--pdf`） |
| `--all` | すべてのデッキ |
| `--out-dir <dir>` | 出力先のフォルダー（デフォルトは `exports/`） |
| `-o, --output <path>` | 出力ファイルのパス（デッキ 1 つ・形式 1 つのとき） |
| `--no-build` | ビルドせず、前回の書き出し用ビルドを使う。それもなければ `dist/` を使う（この場合、発表者ノートが入るのは `notes: "public"` のときだけ） |
| `--base-url <url>` | PDF / PNG: 起動中の開発サーバーやプレビューサーバーから描画する。`base` まで含めて指定する（例: `http://localhost:4321/my-repo`） |
| `--width` / `--height` | PDF / PNG: スライドのサイズ（px。デフォルトは 1920×1080） |

同じプロジェクトで `astro dev` を動かしているときは、`--base-url` を指定してください。指定しないと、PDF / PNG の書き出しが開発サーバーと並行してもう一度ビルドします。

## 日本語のフォント

日本語のスライドを PPTX に書き出すと、フォントは次のように決まります。

- **PowerPoint での表示フォント**: テキストには東アジア言語用のフォントを設定します。スライドの CSS で CJK フォント（Noto Sans JP など）を指定していればそれを使います。指定がなければ、Office に付属する游ゴシック（Yu Gothic）を使います。
- **改行位置の計算**: 文字幅は日本語のフォントで測ります。CSS の CJK フォントが読み込まれていればそのフォント、なければ Google Fonts の Noto Sans JP です。そのため、行の折り返し位置はブラウザでの表示とほぼ同じになります。

ブラウザ・PDF・PPTX で見た目をそろえたいなら、テーマで日本語の Web フォントを指定しておきます。`font` オプションでフォントを読み込み、[カスタムテーマ](/ja/guides/themes-and-plugins/#カスタムテーマ)のフォント指定に加えてください。

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

テーマが読み込んだフォントは PPTX に埋め込みます。Noto Sans JP が入っていない PC の PowerPoint でも、同じフォントで表示されます。

## Linux での Chromium のサンドボックス

PDF / PNG を書き出すとき、Chromium のサンドボックスは有効なままです。Linux でこのサンドボックスを使うには、特権なしのユーザー名前空間が必要です。Ubuntu 23.10 以降や、AppArmor の制限を有効にしたほかのディストリビューションでは、AppArmor のプロファイルで許可されたプログラムしかユーザー名前空間を作れません。

マシン全体の制限は外さないでください。Ubuntu が Google Chrome 用に用意しているのと同じように、Playwright の Chromium にだけプロファイルを追加します。

```text title="/etc/apparmor.d/astlide-chromium"
abi <abi/4.0>,
include <tunables/global>

profile astlide-chromium @{HOME}/.cache/ms-playwright/chromium-*/chrome-linux*/chrome flags=(unconfined) {
  userns,

  include if exists <local/astlide-chromium>
}
```

```bash
sudo apparmor_parser -r /etc/apparmor.d/astlide-chromium
```

パスは、`bunx playwright install chromium` が Chromium をインストールする場所です。`PLAYWRIGHT_BROWSERS_PATH` を設定しているなら、そのフォルダーに書き換えてください。このプロファイルで許可するのは、この実行ファイル 1 つがユーザー名前空間を作ること（サンドボックスに必要な権限）だけです。ほかのプログラムには影響しません。

Docker では、レンダリングサービスの seccomp プロファイルを使ってください（[レンダリングサービス](/ja/guides/server/#セキュリティ)を参照）。`ASTLIDE_CHROMIUM_SANDBOX=0` でサンドボックスを無効にする方法もありますが、内容を信頼できるデッキに限ってください。

## ブラウザ内での PDF 生成（実験的機能）

[ツールバー](/ja/guides/presenting/#ツールバー)に `"download"` を加えると、表示中のデッキをワンクリックで PDF にできます。この機能は別途インストールする [`@astlide/crispdf`](https://www.npmjs.com/package/@astlide/crispdf) を使います。まだ 1.0 前のパッケージなので、出力は今後変わるかもしれません。安定した結果がほしいときは CLI を使ってください。

```bash
bun add -D @astlide/crispdf
```
