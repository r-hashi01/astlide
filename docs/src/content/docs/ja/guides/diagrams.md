---
title: 図
description: "```mermaid のコードフェンスに書いた Mermaid の図を描画します。"
---

[Mermaid](https://mermaid.js.org/) の図は、`mermaid` のコードフェンスに書きます。描画には `mermaid` パッケージを使います。必須の依存ではないので、図を使うときにインストールしてください。

```bash
bun add mermaid
```

````md
```mermaid
flowchart LR
  Write --> Present --> Export
```
````

- **必要なときだけ読み込む** — `mermaid` を読み込むのは、図があるスライドだけです。`mermaid` を入れていないプロジェクトも普通にビルドできます。
- **テーマ**はデッキに合わせます。`dark` / `gradient` なら Mermaid の `dark`、`forest` なら `forest`、それ以外は `default` です。
- **スライドに合わせた大きさ** — ラベルの文字は、スライドの本文と同じ大きさに拡大縮小します。
- `.mdx` と `.md` のスライド、発表者ウィンドウのプレビュー、PDF エクスポートで使えます。エクスポートは図の描画が終わるまで待ちます。
- `mermaid` をインストールしていないときや、図に構文エラーがあるときは、図の代わりにソースをコードとして表示し、ブラウザのコンソールにメッセージを出します。
