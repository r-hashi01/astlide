# Slide examples and components

All components work in `.mdx` slides without imports. Keep a blank line between a component tag and Markdown inside it.

## Layout examples

### cover

```md
---
slideLayout: cover
---

# Q3 review

Ana Lima · October 2026
```

### default

```md
---
slideLayout: default
---

# What we shipped

- PowerPoint import
- Templates as themes
- Editable PPTX export
```

### two-column (MDX)

```mdx
---
slideLayout: two-column
---

# Before and after

<Left>

### Before
Manual exports, broken fonts

</Left>
<Right>

### After
One command, editable text

</Right>
```

### image-left / image-right (MDX)

```mdx
---
slideLayout: image-left
---

<ImageSide src="/images/team.jpg" alt="The team at the offsite" />
<TextPanel>

## The team
Twelve people, four time zones.

</TextPanel>
```

### quote

```md
---
slideLayout: quote
---

> The best way to learn a framework is to present with it.

— Somebody, probably
```

### code

````md
---
slideLayout: code
---

```ts {1|3-6|all}
import { defineCollection } from "astro:content";

const decks = defineCollection({
  loader: astlideDeckLoader(),
  schema: slideSchema,
});
```
````

`{2,4-6}` highlights lines; `{1|3-6|all}` steps through ranges like fragments.

### HTML slide

```html
---
slideLayout: cover
background: "#0b132b"
---
<style>.hero { font-size: 3rem; }</style>
<h1 class="hero">Everything in one HTML file</h1>
```

## Components

| Component | Example | Notes |
|---|---|---|
| `<Columns>` | `<Columns columns={3} gap="1.5rem">` + one `<div>` per column | `align`: start / center / end / stretch; `widths="1fr 2fr"` |
| `<Left>` / `<Right>` | inside `slideLayout: two-column` | fill a template's two content placeholders |
| `<ImageSide>` + `<TextPanel>` | `image-left` / `image-right` | `src` gets Astro's `base` |
| `<Fragment>` | `<Fragment index={1} effect="zoom">Point</Fragment>` | `index`, `until`, `hide`, `effect`: fade / slide-up / zoom / highlight |
| `<Fragments>` | wraps a list; each item is one step | `effect` as above |
| `<CodeBlock title="file.ts">` | wraps a code fence | filename header, copy button |
| `<Math formula="…" />` | `display` for block math | KaTeX, rendered at build time |
| `<SpeakerNotes>` | Markdown notes, hidden from the audience | wins over frontmatter `notes` |
| `<YouTube id="…" start={42} />` | | exports show a linked thumbnail |
| `<Tweet url text author handle date />` | | static card |

Mermaid: a ```` ```mermaid ```` fence (needs `bun add mermaid`).

Speaker notes can also be a comment that ends the slide (`.md`, `.mdx`, `.html`):

```md
# My slide

Content.

<!--
Mention the Q2 numbers first.
-->
```
