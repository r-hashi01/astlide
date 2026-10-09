---
title: Layouts & Components
description: Built-in slide layouts and the components available in MDX slides.
---

## Layouts

Choose a layout per slide with `slideLayout`:

| `slideLayout` | Description |
|---|---|
| `default` | Standard content slide |
| `cover` | Centred title / closing slide |
| `section` | Chapter divider |
| `two-column` | Side-by-side with `<Left>` / `<Right>` |
| `image-full` | Background image with text overlay |
| `image-left` | Image on the left, text on the right |
| `image-right` | Image on the right, text on the left |
| `code` | Optimised padding for code blocks |
| `quote` | Centred blockquote |
| `statement` | Single large sentence |

Plugins can add more — see [Themes & Plugins](/astlide/guides/themes-and-plugins/).

### Two columns

```mdx
---
slideLayout: two-column
---
# Comparison

<Left>
### Before
Old approach
</Left>
<Right>
### After
New approach
</Right>
```

### Image + text

```mdx
---
slideLayout: image-left
---
<ImageSide src="/photo.jpg" alt="Photo" />
<TextPanel>
## Caption
Description text here.
</TextPanel>
```

## Components

All components are available in `.mdx` slides without imports.

### `<Columns>`

```mdx
<Columns columns={3} gap="1.5rem">
<div>

### Option A
First option details.

</div>
<div>

### Option B
Second option details.

</div>
<div>

### Option C
Third option details.

</div>
</Columns>
```

| Prop | Description |
|---|---|
| `columns` | Number of columns (detected from children if omitted) |
| `gap` | Gap between columns (CSS value, default `2rem`) |
| `align` | `start` \| `center` \| `end` \| `stretch` |
| `widths` | Custom widths, e.g. `1fr 2fr 1fr` |

### `<CodeBlock>`

Wraps a code fence with a filename header and a copy button:

````mdx
<CodeBlock title="src/content.config.ts">
```ts
export const collections = { decks };
```
</CodeBlock>
````

See [Code](/astlide/guides/code/) for line highlighting.

### `<Math>`

KaTeX, rendered at build time:

```mdx
Inline: <Math formula="\frac{x^2}{2}" />

<Math formula="\sum_{i=1}^n i^2 = \frac{n(n+1)(2n+1)}{6}" display />
```

### `<YouTube>`

Privacy-enhanced embed; accepts an ID or a full URL:

```mdx
<YouTube id="dQw4w9WgXcQ" start={42} />
```

### `<Tweet>`

A static, styled card — no external API calls:

```mdx
<Tweet
  url="https://x.com/astrodotbuild/status/1234567890"
  text="Astro 5.0 is here! 🚀"
  author="Astro"
  handle="@astrodotbuild"
  date="Dec 3, 2024"
/>
```

### `<Fragment>`, `<Fragments>`, `<SpeakerNotes>`

See [Fragments](/astlide/guides/fragments/) and [speaker notes](/astlide/guides/decks/#speaker-notes).
