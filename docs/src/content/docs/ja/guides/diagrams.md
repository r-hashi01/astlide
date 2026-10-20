---
title: 図
description: "```mermaid のコードフェンスから Mermaid の図を描画します。"
---

[Mermaid](https://mermaid.js.org/) の図は `mermaid` のコードフェンスに書きます。描画にはオプションの `mermaid` パッケージを使うので、図を使うにはインストールしてください。

```bash
bun add mermaid
```

````md
```mermaid
flowchart LR
  Write --> Present --> Export
```
````

- **必要なときだけ読み込み** — `mermaid` を読み込むのは図を含むスライドだけです。インストールしていないプロジェクトも普通にビルドできます。
- **テーマ**はデッキに合わせて決まります。`dark` / `gradient` は Mermaid の `dark`、`forest` は `forest`、それ以外は `default` になります。
- **スライド向けのサイズ** — ラベルはスライドの本文テキストに合わせて拡大縮小されます。
- `.mdx` と `.md` のスライド、発表者ウィンドウのプレビュー、PDF エクスポートで動作します（エクスポートは図の描画完了を待ちます）。
- `mermaid` がインストールされていない場合や図に構文エラーがある場合は、ソースがコードとして表示され、ブラウザのコンソールにメッセージが出力されます。
