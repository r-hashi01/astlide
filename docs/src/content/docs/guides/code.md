---
title: Code
description: Syntax highlighting, line highlighting and highlight steps.
---

Code fences are highlighted with [Shiki](https://shiki.style) (theme `github-dark` by default — change it with the [`shikiTheme`](/astlide/reference/configuration/) option).

## Line highlighting

Add a `{…}` range after the language to highlight lines; the rest are dimmed:

````md
```ts {2,4-6}
// highlights line 2 and lines 4–6
```
````

## Highlight steps

Separate ranges with `|` to step through them with `→` / `Space`, like [fragments](/astlide/guides/fragments/). `all` or `*` highlights every line:

````md
```ts {1|3-6|8|all}
import { defineCollection } from "astro:content";

const decks = defineCollection({
  loader: astlideDeckLoader(),
  schema: slideSchema,
});

export const collections = { decks };
```
````

- The first range is the initial state; each further range is one step.
- Steps interleave with fragments in document order (code steps count as index `0`).
- Works in `.mdx` and `.md` slides, including inside `<CodeBlock>`.
- PDF export shows the last step.

Adjust the dimming with the `--code-dim-opacity` CSS variable (default `0.35`).

## Filename header and copy button

Wrap a fence in [`<CodeBlock title="…">`](/astlide/guides/layouts-and-components/#codeblock).

## Using the transformer elsewhere

The Shiki transformer behind this is exported, so you can use it in your own Shiki setup:

```ts
import { astlideCodeHighlight } from "@astlide/core/utils/code-highlight";
```
