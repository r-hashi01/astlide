---
title: スライドの frontmatter
description: スライドで使える frontmatter のフィールド一覧。
---

`.mdx`、`.md`、`.html` のどのスライドでも、同じ frontmatter を使えます。

```yaml
---
slideLayout: default
transition: fade
title: "Agenda"
background: "#1e293b"
class: "text-light"
notes: "Speaker notes"
hidden: false
---
```

| フィールド | 型 | デフォルト | 説明 |
|---|---|---|---|
| `slideLayout` | `string` | `"default"` | レイアウト。`default`、`cover`、`section`、`two-column`、`image-full`、`image-left`、`image-right`、`code`、`quote`、`statement`、またはプラグインのレイアウト。 |
| `transition` | `string` | `"fade"` | `none`、`fade`、`slide-left`、`slide-right`、`slide-up`、`zoom`、またはプラグインのトランジション。 |
| `title` | `string` | 最初の見出し | スライドへの移動ダイアログに表示するタイトル。 |
| `background` | `string` | — | CSS の背景（色、グラデーション、`url(…)`）。スクリプトのようなパターンを含む値は拒否されます。 |
| `class` | `string` | — | スライドに追加するクラス。例: `text-light`、`text-dark`。 |
| `notes` | `string` | — | スピーカーノート（Markdown）。本文の `<SpeakerNotes>` が優先されます。これが未設定の場合は、末尾の `<!-- … -->` コメントが使われます。 |
| `hidden` | `boolean` | `false` | 本番ビルドでスライドをスキップします。 |

:::caution
`layout` ではなく `slideLayout` を使ってください。`layout` は Astro の MDX パイプラインの予約語です。
:::

存在しないレイアウト、トランジション、テーマを指定してもビルドは失敗しません。警告がログに出力され、開発中はオーバーレイが表示されます。
