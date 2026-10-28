---
title: エクスポート
description: デッキを PDF、PNG、PowerPoint に書き出します。
---

`astlide export` を使うと、デッキをファイルに書き出せます。配布用の PDF、スライドごとの PNG 画像、ほかの人が編集できる PowerPoint ファイルの 3 つの形式に対応しています。

## 書き出しのコマンド

```bash
bunx astlide export my-talk                 # → exports/my-talk.pdf
bunx astlide export my-talk --pptx          # → exports/my-talk.pptx (editable PowerPoint)
bunx astlide export my-talk --png           # → exports/my-talk-slides/*.png
bunx astlide export --all --pdf --pptx      # every deck, both formats
```

`my-talk` には、`src/content/decks/` にあるデッキのフォルダー名を指定します。形式を指定しなければ PDF になります。PNG のファイル名は `slide-001.png`、`slide-002.png` のような連番です。

`bun create astlide` で作ったプロジェクトなら、スクリプトとしても実行できます（`bun run export my-talk --pptx`）。

コマンドはプロジェクト内のどのフォルダーで実行してもかまいません。デッキは `src/content/decks/my-talk` や `dist/my-talk` のようにパスでも指定できます。その場合、プロジェクトはパスをたどって見つけます。

## PDF と PNG

PDF と PNG は、[Playwright](https://playwright.dev) が動かすヘッドレスの Chromium で描画します。最初に一度だけ Chromium をインストールしてください。

```bash
bunx playwright install chromium
```

サーバーを自分で起動する必要はありません。`astlide export` がサイトをビルドし、空いているポートで配信して描画し、終わったらサーバーを止めます。Astro の [`base`](/ja/guides/deploy/) も自動で反映されます。

各スライドは最後まで進めた状態で出力されます。段階表示もコードのステップも、すべて表示された状態です。Mermaid の図は描画が終わるのを待ってから書き出します。

描画中も Chromium のサンドボックスは有効です。Linux では、サンドボックスの動作に特権なしのユーザー名前空間が必要です。Ubuntu 24.04 や多くのコンテナでは、これが制限されています。その場合、書き出しは途中で止まり、Chromium にだけ許可する方法が表示されます。詳しくは[Linux での Chromium のサンドボックス](#linux-での-chromium-のサンドボックス)を参照してください。

## PowerPoint（PPTX）

PPTX の書き出しにはブラウザを使いません。Playwright がなくても書き出せます。ビルドしたスライドを Astlide 独自の CSS レイアウトエンジンで配置し、編集できる図形とテキストボックスとして PowerPoint ファイルに書き込みます。

スライドの要素は、PPTX では次のようになります。

- テキストは編集できるテキストボックスに、表は PowerPoint の表になります。
- ボックス、CSS の `::before` / `::after` で入れたテキスト、単純なインライン SVG（四角形、円、線と矢印、パス、テキスト）は、編集できる図形になります。
- Mermaid の図は、プロジェクトにインストールされている `mermaid` で描画し、画像として配置します。グラデーションや円弧などを含む SVG も画像になります。
- PNG と SVG の画像はそのまま入ります。
- `<iframe>` の扱いは、中身が何かによって変わります。[自前の埋め込みに静的な代替を用意する](/ja/guides/layouts-and-components/#自前の埋め込みに静的な代替を用意する)を参照してください。
- 発表者ノートは PowerPoint のノート欄に入ります。

テーマで読み込んだフォントはファイルに埋め込みます。そのフォントが入っていない PC でも、PowerPoint は同じフォントで表示します。ただし、ライセンスで埋め込みが禁止されているフォントは埋め込まず、警告を表示します。日本語のテキストについては[日本語のフォント](#日本語のフォント)で説明します。

## 発表者ノートと `dist/`

書き出しのたびに、`node_modules/.astro/astlide-export` に専用のビルドを作ります。`dist/` には手を付けないので、書き出しによってデプロイする内容が変わることはありません。

書き出し用のビルドには、[`notes` オプション](/ja/guides/decks/#発表者ノート)の設定にかかわらず発表者ノートが入ります。PPTX のノート欄に入れるためです。通常の `astro build` では、`notes: "public"` を設定しない限りノートは入りません。

## オプション

| オプション | |
|---|---|
| `--pdf` `--pptx` `--png` | 書き出す形式。複数を組み合わせられます。デフォルトは `--pdf` |
| `-a, --all` | すべてのデッキを書き出す |
| `--out-dir <dir>` | 書き出し先のフォルダー。デフォルトは `exports/` |
| `-o, --output <path>` | 出力先のパスを直接指定する。デッキ 1 つ・形式 1 つのときだけ使えます。PNG ではフォルダーを指定します |
| `--no-build` | ビルドを省き、前回の書き出し用ビルドを使う。それがなければ `dist/` を使います。この場合、発表者ノートが入るのは `notes: "public"` でビルドしたときだけです |
| `--base-url <url>` | PDF / PNG のみ。起動中の開発サーバーやプレビューサーバーから描画する。`base` まで含めて指定します（例: `http://localhost:4321/my-repo`） |
| `--width` / `--height` | PDF / PNG のみ。スライドのサイズ（px）。デフォルトは 1920×1080 |
| `--cwd <dir>` | プロジェクトのルート。プロジェクトの外でコマンドを実行するときに指定します |

そのプロジェクトで `astro dev` を起動しているなら、`--base-url` を付けてください。付けないと、PDF や PNG を書き出すときに開発サーバーとは別にもう一度ビルドが走ります。

## 日本語のフォント

日本語を含むスライドを PPTX に書き出すときは、次の 2 点が自動で決まります。

- **PowerPoint で表示するフォント**: テキストには東アジア言語用のフォントを設定します。CSS に CJK フォント（Noto Sans JP など）があれば、最初に指定されたものを使います。なければ Office に付属する游ゴシック（Yu Gothic）です。
- **改行の位置**: 文字の幅は日本語のフォントで測ります。CSS の CJK フォントが読み込まれていればそれを、なければ Google Fonts の Noto Sans JP を使います。そのため、折り返しの位置はブラウザでの表示とほぼ同じになります。

ブラウザ、PDF、PPTX の見た目をそろえるには、`font` オプションで日本語の Web フォントを読み込み、[カスタムテーマ](/ja/guides/themes-and-plugins/#カスタムテーマ)のフォント指定に加えます。

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

テーマで読み込んだフォントは PPTX に埋め込まれます。Noto Sans JP が入っていない PC でも、PowerPoint は同じフォントで表示します。

## Linux での Chromium のサンドボックス

PDF と PNG を書き出すとき、Chromium のサンドボックスは有効なままです。Linux でこのサンドボックスを使うには、特権なしのユーザー名前空間が必要です。Ubuntu 23.10 以降や、AppArmor の制限を有効にしているディストリビューションでは、AppArmor のプロファイルで許可したプログラムしかユーザー名前空間を作れません。

この制限をマシン全体で外すのは避けてください。Ubuntu が Google Chrome に対してしているのと同じように、Playwright の Chromium 専用のプロファイルを追加します。

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

プロファイル内のパスは、`bunx playwright install chromium` が Chromium を置く場所です。`PLAYWRIGHT_BROWSERS_PATH` を設定している場合は、そのフォルダーに書き換えてください。このプロファイルで許可されるのは、この実行ファイルがユーザー名前空間を作ることだけです。サンドボックスに必要なのはこの権限だけで、システムのほかの部分は変わりません。

Docker では、レンダリングサービスの seccomp プロファイルを使ってください（[レンダリングサービス](/ja/guides/server/#セキュリティ)を参照）。

`ASTLIDE_CHROMIUM_SANDBOX=0` でサンドボックスを無効にすることもできます。ただし、内容を信頼できるデッキだけにしてください。

## ブラウザ内での PDF 生成（実験的機能）

[ツールバー](/ja/guides/presenting/#ツールバー)に `"download"` を加えると、表示中のデッキを PDF で保存するボタンが出ます。このボタンを使うには、別パッケージの [`@astlide/crispdf`](https://www.npmjs.com/package/@astlide/crispdf) が必要です。

```bash
bun add -D @astlide/crispdf
```

このパッケージはまだ 1.0 未満で、出力は今後変わる可能性があります。安定した結果がほしいときは CLI を使ってください。
