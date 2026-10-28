---
title: スライドの frontmatter
description: スライドに書ける frontmatter のフィールド一覧。
---

`.mdx`、`.md`、`.html` のどのスライドにも、同じ frontmatter を書けます。

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
| `title` | `string` | 最初の見出し | スライドへ移動するダイアログに出すタイトル。 |
| `background` | `string` | — | CSS の背景（色、グラデーション、`url(…)`）。スクリプトに見えるパターンを含む値は受け付けません。 |
| `class` | `string` | — | スライドに追加するクラス。例: `text-light`、`text-dark`。 |
| `notes` | `string` | — | 発表者ノート（Markdown）。本文に `<SpeakerNotes>` があれば、そちらを優先します。`notes` を書いていなければ、末尾の `<!-- … -->` コメントをノートとして使います。 |
| `hidden` | `boolean` | `false` | 本番ビルドでこのスライドを飛ばします。 |

:::caution
`layout` ではなく `slideLayout` を使ってください。`layout` は Astro の MDX パイプラインの予約語です。
:::

存在しないレイアウト、トランジション、テーマを指定しても、ビルドは止まりません。ログに警告を出し、開発中は画面にオーバーレイも表示します。
