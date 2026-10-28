---
title: Code
description: Syntax highlighting, highlighted lines, and highlights that change step by step.
---

Code fences in slides are syntax-highlighted with [Shiki](https://shiki.style). The default theme is `github-dark`. To use a different one, set the [`shikiTheme`](/reference/configuration/) option.

## Line highlighting

To draw attention to certain lines, put the line numbers in braces after the language. Those lines are highlighted and the others are dimmed:

````md
```ts {2,4-6}
// highlights line 2 and lines 4–6
```
````

Separate single lines with commas and write ranges as `4-6`.

## Highlight steps

To walk through a code sample, separate several ranges with `|`. The slide starts on the first range, and each press of `→` or `Space` moves to the next one, the same way [fragments](/guides/fragments/) appear. `all` or `*` highlights every line:

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

In this example the slide opens with line 1 highlighted, then steps through lines 3–6, line 8, and finally the whole block.

- Code steps and fragments share one sequence on the slide. Code steps count as unindexed, so they run in document order together with unindexed fragments, before any fragment that has an `index`. See [Step order](/guides/fragments/#step-order).
- Steps work in `.mdx` and `.md` slides, including inside `<CodeBlock>`.
- Exports (PDF, PNG and PPTX) and the `/<deck>/all` print view show the last step.

To change how faint the dimmed lines are, set the `--code-dim-opacity` CSS variable. The default is `0.35`.

## Filename header and copy button

To show a filename above the code and add a copy button, wrap the fence in [`<CodeBlock title="…">`](/guides/layouts-and-components/#codeblock).

## Using the transformer in your own Shiki setup

Line highlighting and steps come from a Shiki transformer that Astlide registers for you. If you render code with Shiki yourself, you can import it:

```ts
import { astlideCodeHighlight } from "@astlide/core/utils/code-highlight";
```

The transformer only adds classes and data attributes to the HTML. The dimming and the stepping come from Astlide's slide styles and deck runtime, so outside a deck you need to style the `highlighted` lines yourself.
