---
title: 段階表示
description: <Fragment> と <Fragments> で、スライドの内容を 1 ステップずつ表示します。
---

段階表示を使うと、スライドの内容を 1 ステップずつ見せられます。`→` / `Space` で進み、`←` で戻ります。そのスライドのステップを出し切ったあとに `→` を押すと、次のスライドに移ります。

## `<Fragment>`

```mdx
<Fragment index={1}>First point</Fragment>
<Fragment index={2}>Second point</Fragment>
<Fragment index={2} effect="zoom">Appears together with the second</Fragment>
<Fragment index={3} effect="highlight">Third — highlighted</Fragment>
```

| プロパティ | 説明 |
|---|---|
| `index` | ステップ番号。同じ index のものは**同時に**表示します。index を付けないものは、index 付きのものより先に、書いた順に 1 ステップずつ表示します。 |
| `until` | ステップ `until` まで進むと、再び隠します。 |
| `hide` | 最初から表示しておき、自分のステップで消します。 |
| `effect` | `fade`（デフォルト）\| `slide-up` \| `zoom` \| `highlight` |

```mdx
<Fragment index={1} until={3}>Visible for steps 1–2 only</Fragment>
<Fragment index={3} hide>Visible until step 3</Fragment>
```

## `<Fragments>`

リストを 1 項目ずつ表示します。第 1 階層のリスト項目が 1 つずつステップになります。リストがなければ、子要素が 1 つずつステップになります。

```mdx
<Fragments effect="slide-up">

- Problem
- Approach
- Result

</Fragments>
```

:::note
`<Fragments>` の中のリストは、前後に空行を入れてください。空行がないと、MDX がリストを Markdown として解釈しません。
:::

## 表示順

段階表示と[コードのハイライトのステップ](/ja/guides/code/#ハイライトのステップ表示)は、スライドごとに 1 つの順番にまとめて進みます。

1. まず、index のないステップを書いた順に。
2. 次に、index 付きのステップを `index` の順に（同じ index のステップは同時に進みます）。

## 発表とエクスポート

- ステップは**発表者ウィンドウと聴衆側のウィンドウで同期します**。発表者ウィンドウで表示を進めると、聴衆側にも反映されます。
- 発表者パネルには、今のスライドに残っているステップの数が出ます。
- PDF エクスポートと `/<deck>/all` の印刷用ビューでは、各スライドを**最後の**状態で表示します。つまり段階表示の要素はすべて表示し、`until` / `hide` を付けたものは隠します。
