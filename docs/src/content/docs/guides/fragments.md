---
title: Fragments
description: Reveal parts of a slide one step at a time with <Fragment> and <Fragments>.
---

Fragments let you reveal parts of a slide one step at a time. Press `→` or `Space` to show the next step and `←` to go back. When a slide has no steps left, `→` moves on to the next slide.

## `<Fragment>`

Wrap any content in `<Fragment>` to make it a step:

```mdx
<Fragment index={1}>First point</Fragment>
<Fragment index={2}>Second point</Fragment>
<Fragment index={2} effect="zoom">Appears together with the second</Fragment>
<Fragment index={3} effect="highlight">Third — highlighted</Fragment>
```

| Prop | Description |
|---|---|
| `index` | Where the fragment falls in the order. Fragments with the same `index` appear **together**. Fragments without `index` each get their own step, in the order they appear in the file, before any fragment with an `index`. |
| `until` | Hides the fragment again at the step with this `index`. Use it together with `index`. |
| `hide` | Shows the fragment from the start and hides it at its own step. |
| `effect` | `fade` (default) \| `slide-up` \| `zoom` \| `highlight` |

`until` and `hide` let content leave the slide:

```mdx
<Fragment index={1} until={3}>Visible for steps 1–2 only</Fragment>
<Fragment index={3} hide>Visible until step 3</Fragment>
```

## `<Fragments>`

To reveal a list one item at a time, wrap it in `<Fragments>`. Each top-level list item becomes its own step. If there is no list inside, each child element becomes a step instead.

```mdx
<Fragments effect="slide-up">

- Problem
- Approach
- Result

</Fragments>
```

`effect` applies to every item and takes the same values as on `<Fragment>`. The items work like fragments without an `index`.

:::note
Leave a blank line before and after the list inside `<Fragments>`. Without them, MDX doesn't read the list as Markdown.
:::

## Step order

Each slide has one sequence of steps, shared by fragments and [code highlight steps](/guides/code/#highlight-steps). Astlide orders it like this:

1. Steps without an `index` come first, in the order they appear in the file.
2. Steps with an `index` follow, sorted by `index`. Steps with the same `index` happen at once.

`index` values only set the order. Gaps don't add empty steps, so `index={1}` and `index={5}` on one slide are just two steps in a row. If a slide has two fragments without an `index`, a fragment with `index={1}` shows up on the third press.

## Presenting and exporting

- Steps stay **in sync between the presenter window and the audience window**. When you reveal a step from the presenter window, the audience sees it too.
- The presenter window shows how many steps are left on the current slide.
- PDF export and the print view (`/<deck>/all`) show every slide in its **final** state: all fragments are revealed, and fragments with `until` or `hide` are hidden.
