---
title: Fragments
description: Reveal content step by step with <Fragment> and <Fragments>.
---

Fragments reveal content one step at a time — press `→` / `Space` to go forward and `←` to go back. Once a slide has no steps left, `→` moves to the next slide.

## `<Fragment>`

```mdx
<Fragment index={1}>First point</Fragment>
<Fragment index={2}>Second point</Fragment>
<Fragment index={2} effect="zoom">Appears together with the second</Fragment>
<Fragment index={3} effect="highlight">Third — highlighted</Fragment>
```

| Prop | Description |
|---|---|
| `index` | Step number. Fragments sharing an index reveal **together**. Unindexed fragments reveal one per step in document order, before indexed ones. |
| `until` | Hide the fragment again when step `until` is reached. |
| `hide` | Start visible and disappear at the fragment's step. |
| `effect` | `fade` (default) \| `slide-up` \| `zoom` \| `highlight` |

```mdx
<Fragment index={1} until={3}>Visible for steps 1–2 only</Fragment>
<Fragment index={3} hide>Visible until step 3</Fragment>
```

## `<Fragments>`

Reveal a list one item at a time. Each first-level list item — or each child element when there's no list — becomes its own step:

```mdx
<Fragments effect="slide-up">

- Problem
- Approach
- Result

</Fragments>
```

:::note
Keep blank lines around the list inside `<Fragments>` so MDX parses it as Markdown.
:::

## Ordering

Fragments and [code highlight steps](/astlide/guides/code/#highlight-steps) share one sequence per slide:

1. unindexed steps, in document order;
2. then indexed steps, by `index` (steps sharing an index happen together).

## Presenting and exporting

- Steps are **mirrored between the presenter and audience windows** — reveal from the presenter screen and the audience sees it.
- The presenter panel shows how many steps are left on the current slide.
- PDF export and the `/<deck>/all` print view show each slide's **final** state (fragments revealed, `until` / `hide` fragments hidden).
