---
title: 段階表示
description: <Fragment> と <Fragments> を使って、スライドの内容を 1 ステップずつ表示します。
---

段階表示を使うと、スライドの内容を 1 ステップずつ順に見せられます。`→` か `Space` で次のステップを表示し、`←` で 1 つ戻ります。スライドのステップをすべて表示し終えると、`→` で次のスライドに進みます。

## `<Fragment>`

`<Fragment>` で囲んだ部分が 1 つのステップになります。

```mdx
<Fragment index={1}>First point</Fragment>
<Fragment index={2}>Second point</Fragment>
<Fragment index={2} effect="zoom">Appears together with the second</Fragment>
<Fragment index={3} effect="highlight">Third — highlighted</Fragment>
```

| プロパティ | 説明 |
|---|---|
| `index` | 表示する順番です。同じ `index` のものは**同時に**表示します。`index` を付けないものは、ファイルに書いた順に 1 つずつ表示し、`index` 付きのものより先に出ます。 |
| `until` | この値と同じ `index` のステップで、再び隠します。`index` と組み合わせて使います。 |
| `hide` | 最初から表示しておき、自分のステップで隠します。 |
| `effect` | `fade`（既定）\| `slide-up` \| `zoom` \| `highlight` |

`until` と `hide` を使うと、途中で内容を消せます。

```mdx
<Fragment index={1} until={3}>Visible for steps 1–2 only</Fragment>
<Fragment index={3} hide>Visible until step 3</Fragment>
```

## `<Fragments>`

リストを 1 項目ずつ表示したいときは、リストを `<Fragments>` で囲みます。第 1 階層の項目がそれぞれ 1 ステップになります。中にリストがなければ、子要素が 1 つずつステップになります。

```mdx
<Fragments effect="slide-up">

- Problem
- Approach
- Result

</Fragments>
```

`effect` はすべての項目に適用され、指定できる値は `<Fragment>` と同じです。各項目は、`index` を付けない `<Fragment>` と同じ扱いになります。

:::note
`<Fragments>` の中のリストは、前後に空行を入れてください。空行がないと、MDX がリストを Markdown として読み取りません。
:::

## ステップの順番

1 枚のスライドのステップは、段階表示と[コードのハイライトのステップ](/ja/guides/code/#ハイライトのステップ表示)をまとめて 1 列に並べます。並び順は次のとおりです。

1. `index` のないステップが先に来ます。順番はファイルに書いた順です。
2. 続いて、`index` のあるステップを `index` の小さい順に並べます。同じ `index` のステップは同時に進みます。

`index` の値が決めるのは順番だけです。値が飛んでいても、空のステップはできません。たとえば同じスライドに `index={1}` と `index={5}` しかなければ、連続した 2 つのステップになります。また、`index` のない段階表示が 2 つあるスライドでは、`index={1}` のものは 3 回目の操作で表示されます。

## 発表とエクスポート

- ステップは**発表者ウィンドウと聴衆向けのウィンドウで同期します**。発表者ウィンドウでステップを進めると、聴衆側の表示も進みます。
- 発表者ウィンドウには、今のスライドに残っているステップ数が表示されます。
- PDF エクスポートと印刷用ビュー（`/<deck>/all`）では、すべてのスライドを**最後の**状態で表示します。段階表示の要素はすべて表示され、`until` や `hide` を付けたものは隠れます。
