---
title: スライドの frontmatter
description: スライドの frontmatter に書ける項目と、そのデフォルト値の一覧です。
---

レイアウトやトランジション、背景などは、スライドごとに frontmatter で指定します。書ける項目は `.mdx`・`.md`・`.html` のどのスライドでも同じで、すべて省略できます。

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

| 項目 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `slideLayout` | `string` | `"default"` | レイアウトです。`default`、`cover`、`section`、`two-column`、`image-full`、`image-left`、`image-right`、`code`、`quote`、`statement` のほか、プラグインや PowerPoint テンプレートのレイアウトも指定できます。[レイアウト](/ja/guides/layouts-and-components/#レイアウト)を参照してください。 |
| `transition` | `string` | `"fade"` | このスライドに切り替わるときのトランジションです。`none`、`fade`、`slide-left`、`slide-right`、`slide-up`、`zoom` か、プラグインのトランジションを指定します。 |
| `title` | `string` | 最初の見出し | スライド移動のダイアログ（`g`）に出る名前です。省略すると、スライド内で最初の Markdown か HTML の見出しを使います。見出しもなければ `Slide N` になります。 |
| `background` | `string` | なし | スライドの背景です。色、`linear-gradient()`・`radial-gradient()`、`url(…)`、`/images/photo.jpg` のような画像のパスを指定できます。画像はスライド全体を覆うように表示します。`/` で始まるパスには Astro の `base` を付けます。 |
| `class` | `string` | なし | スライドに追加するクラスです。`text-light` や `text-dark` などを指定します。 |
| `notes` | `string` | なし | 発表者ノートです。Markdown で書けます。[発表者ノート](#発表者ノート)を参照してください。 |
| `hidden` | `boolean` | `false` | ビルドしたデッキでスライドを隠します。[スライドを隠す](#スライドを隠す)を参照してください。 |

:::caution
レイアウトの指定には必ず `slideLayout` を使い、`layout` とは書かないでください。`layout` は Astro の MDX が予約しているキーです。
:::

## 発表者ノート

発表者ノートは 3 通りの方法で書けます。複数の方法で書いた場合は、次の順で先に見つかったものを使います。

1. スライド本文の `<SpeakerNotes>`（`.mdx` のスライド）
2. frontmatter の `notes`
3. スライドの末尾に置いた HTML コメント（例: `<!-- デモの話をする -->`）

発表中にノートがどう表示されるかは、[発表者ノート](/ja/guides/decks/#発表者ノート)で説明しています。

## スライドを隠す

`hidden: true` のスライドも、開発サーバーではふつうに表示されます。隠したまま編集を続けられるようにするためです。ビルドしたデッキでは、スライド送りとスライド移動のダイアログがこのスライドを飛ばします。URL を直接開いた場合は、次の表示対象のスライドへリダイレクトします。ほかのスライドの番号は変わりません。

## 無効な値

`background` に、コードを実行できそうな値を書くと、スキーマの検証に失敗します。Astro はそのスライドをエラーとして報告します。対象になるのは、`expression(…)`、`javascript:`、`vbscript:`、`@import`、`behavior:`、波かっこ、HTML か SVG の `data:` URL です。

一方、`slideLayout`、`transition`、デッキの `theme` に存在しない名前を書いても、ビルドは止まりません。そのスライドはデフォルトのスタイルで表示します。開発サーバーでは、警告をログに出すとともに、指定できる名前の一覧と一緒にスライド上にも表示します。
