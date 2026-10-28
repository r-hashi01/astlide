---
title: Slide Frontmatter
description: Every frontmatter field a slide accepts, with its default.
---

Each slide can set its layout, transition, background and more in frontmatter. The fields are the same in `.mdx`, `.md` and `.html` slides, and all of them are optional.

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
| `slideLayout` | `string` | `"default"` | The layout: `default`, `cover`, `section`, `two-column`, `image-full`, `image-left`, `image-right`, `code`, `quote`, `statement`, or a layout from a plugin or a PowerPoint template. See [Layouts](/guides/layouts-and-components/#layouts). |
| `transition` | `string` | `"fade"` | The transition into this slide: `none`, `fade`, `slide-left`, `slide-right`, `slide-up`, `zoom`, or a transition from a plugin. |
| `title` | `string` | the first heading | The slide's name in the go-to-slide dialog (`g`). Without it, Astlide uses the slide's first Markdown or HTML heading, and then `Slide N`. |
| `background` | `string` | none | The slide background: a color, a `linear-gradient()` or `radial-gradient()`, `url(…)`, or an image path such as `/images/photo.jpg`. Images cover the whole slide. A path starting with `/` gets Astro's `base` added. |
| `class` | `string` | none | Extra classes on the slide, such as `text-light` or `text-dark`. |
| `notes` | `string` | none | Speaker notes, in Markdown. See [Speaker notes](#speaker-notes). |
| `hidden` | `boolean` | `false` | Hides the slide in builds. See [Hidden slides](#hidden-slides). |

:::caution
Write `slideLayout`, never `layout`. Astro's MDX pipeline reserves `layout` for its own use.
:::

## Speaker notes

A slide can have notes in three places. When there is more than one, Astlide uses the first it finds in this order:

1. `<SpeakerNotes>` in the slide body (`.mdx` slides)
2. the `notes` field
3. an HTML comment at the very end of the slide, such as `<!-- Mention the demo -->`

See [Speaker notes](/guides/decks/#speaker-notes) for how notes appear while you present.

## Hidden slides

On the dev server, a slide with `hidden: true` shows as usual, so you can keep editing it. In a build, navigation and the go-to-slide dialog skip it, and its URL redirects to the next visible slide. The other slides keep their numbers.

## Invalid values

A `background` that looks like it could run code fails schema validation, and Astro reports an error for that slide. This covers `expression(…)`, `javascript:`, `vbscript:`, `@import`, `behavior:`, curly braces, and `data:` URLs for HTML or SVG.

An unknown name in `slideLayout`, `transition` or the deck's `theme` doesn't stop the build. The slide falls back to the default styles. On the dev server, Astlide also logs a warning and shows it on the slide, with the list of known names.
