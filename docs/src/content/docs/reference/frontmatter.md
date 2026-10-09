---
title: Slide Frontmatter
description: Every frontmatter field a slide accepts.
---

The same frontmatter works in `.mdx`, `.md` and `.html` slides.

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

| Field | Type | Default | Description |
|---|---|---|---|
| `slideLayout` | `string` | `"default"` | Layout — `default`, `cover`, `section`, `two-column`, `image-full`, `image-left`, `image-right`, `code`, `quote`, `statement`, or a plugin layout. |
| `transition` | `string` | `"fade"` | `none`, `fade`, `slide-left`, `slide-right`, `slide-up`, `zoom`, or a plugin transition. |
| `title` | `string` | first heading | Slide title for the go-to-slide dialog. |
| `background` | `string` | — | CSS background (color, gradient or `url(…)`). Values containing script-like patterns are rejected. |
| `class` | `string` | — | Extra classes on the slide — e.g. `text-light`, `text-dark`. |
| `notes` | `string` | — | Speaker notes (Markdown). `<Notes>` in the body takes priority. |
| `hidden` | `boolean` | `false` | Skip the slide in production builds. |

:::caution
Use `slideLayout`, not `layout` — Astro's MDX pipeline reserves `layout`.
:::

Unknown layouts, transitions or themes don't fail the build; they log a warning and show an overlay in development.
