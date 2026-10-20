---
title: フラグメント
description: <Fragment> と <Fragments> でコンテンツを 1 ステップずつ表示します。
---

フラグメントを使うと、コンテンツを 1 ステップずつ表示できます。`→` / `Space` で進み、`←` で戻ります。スライドに残りのステップがなくなると、`→` で次のスライドへ移ります。

## `<Fragment>`

```mdx
<Fragment index={1}>First point</Fragment>
<Fragment index={2}>Second point</Fragment>
<Fragment index={2} effect="zoom">Appears together with the second</Fragment>
<Fragment index={3} effect="highlight">Third — highlighted</Fragment>
```

| プロパティ | 説明 |
|---|---|
| `index` | ステップ番号です。同じ index のフラグメントは**同時に**表示されます。index のないフラグメントは、index 付きのものより先に、文書順に 1 ステップずつ表示されます。 |
| `until` | ステップ `until` に達したら、フラグメントを再び隠します。 |
| `hide` | 最初は表示しておき、フラグメントのステップで消します。 |
| `effect` | `fade`（デフォルト）\| `slide-up` \| `zoom` \| `highlight` |

```mdx
<Fragment index={1} until={3}>Visible for steps 1–2 only</Fragment>
<Fragment index={3} hide>Visible until step 3</Fragment>
```

## `<Fragments>`

リストを 1 項目ずつ表示します。第 1 階層のリスト項目（リストがない場合は子要素）がそれぞれ 1 ステップになります。

```mdx
<Fragments effect="slide-up">

- Problem
- Approach
- Result

</Fragments>
```

:::note
MDX が Markdown として解釈できるように、`<Fragments>` で囲んだリストの前後には、空行を入れてください。
:::

## 表示順

フラグメントと[コードのハイライトのステップ](/astlide/ja/guides/code/#ハイライトのステップ表示)は、スライドごとに 1 つの順序を共有します。

1. まず index のないステップを文書順に。
2. 次に index 付きのステップを `index` 順に（同じ index のステップは同時に進みます）。

## プレゼンとエクスポート

- ステップは**発表者ウィンドウと聴衆側のウィンドウで同期**します。発表者画面で表示を進めると、聴衆側にも反映されます。
- 発表者パネルには、現在のスライドに残っているステップ数が表示されます。
- PDF エクスポートと `/<deck>/all` の印刷用ビューでは、各スライドが**最終**状態で表示されます（フラグメントは表示済み、`until` / `hide` のフラグメントは非表示）。
