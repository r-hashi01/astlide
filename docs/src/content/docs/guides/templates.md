---
title: PowerPoint templates
description: Register a PowerPoint or Google Slides template as a theme and write the slides in Markdown.
---

If your company has a PowerPoint template, you can register it as a theme and keep writing slides in Markdown. The slides then use the template's backgrounds and artwork, theme colors, fonts and slide numbers, and their text goes into the template's placeholders with the placeholders' text style.

Register the file under a theme name in `astro.config.mjs`:

```js
// astro.config.mjs
import astlide from "@astlide/astro";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    astlide({
      templates: { brand: "./templates/brand.pptx" },
    }),
  ],
});
```

Then use that name as the deck's theme:

```json
// src/content/decks/q3-review/_config.json
{ "title": "Q3 review", "theme": "brand" }
```

The file can be a presentation (`.pptx`), a template (`.potx`) or an Office theme (`.thmx`). For a Google Slides template, choose File → Download → Microsoft PowerPoint and use the downloaded file. While `astro dev` is running, saving the template file reloads the deck.

If your team keeps its templates in a [template store](/guides/template-storage/) (a shared folder or a bucket), name the store instead, and every template in it becomes a theme:

```js
astlide({ templates: "s3://acme-assets/astlide/templates" })
```

## Where the content goes

If a slide starts with a heading, that heading goes into the layout's title placeholder. Everything else goes into the body placeholder. The text takes the placeholder's font, size, color, alignment and insets.

```md
---
slideLayout: default
---

# What we shipped        ← the title placeholder

- Import PowerPoint      ← the body placeholder
- Templates as themes
```

In a layout with two content placeholders side by side, `<Left>` fills the first and `<Right>` the second, with the same gap between them as in the template. If the layout has a slide-number placeholder, the slide's number appears there.

## Layouts

Each built-in layout uses a matching layout from the template:

| `slideLayout` | Template layout |
|---|---|
| `cover` | Title Slide |
| `section` | Section Header |
| `default` | Title and Content |
| `two-column` | Two Content |
| `code` | Title Only (else Title and Content) |

Astlide finds the match by the layout's type in PowerPoint. Files exported from Google Slides often have untyped layouts, so it also matches by name, such as "Title slide" or "Section header". If nothing matches `default`, the first layout with a title and one body placeholder is used.

You can also use any of the template's layouts directly. Write its name as a slug: `slideLayout: comparison`, `slideLayout: title-only`, `slideLayout: picture-with-caption` and so on.

The other built-in layouts (`quote`, `statement`, `image-left` …) keep their own arrangement and sit on the template's master background. If a slide sets its own `background`, that replaces the template's artwork.

## Theme variables

Astlide sets the theme variables from the template, so components and your own CSS pick up its colors and fonts:

| Variable | From the template |
|---|---|
| `--color-background` / `--color-foreground` | Light 1 / Dark 1 |
| `--color-primary` / `--color-accent` | Accent 1 / Accent 2 |
| `--color-secondary` / `--color-muted` | Dark 2 / Light 2 |
| `--font-heading` / `--font-body` | Heading / body font |
| `--font-size-base` / `--font-size-h1` | Body / title text size of Title and Content |

The template's fonts must be available where the slides are viewed, as with any theme. Install them there, or embed them in the template with PowerPoint's "Embed fonts in the file" option.

## From code

`@astlide/core/pptx` reads a template without the integration:

```ts
import { pptxToTemplate, templateCss } from "@astlide/core/pptx";

const template = pptxToTemplate(await readFile("brand.pptx"), {
  media: ({ name, data, type }) => saveSomewhere(name, data, type),
});
template.layouts;   // per layout: name, id, artwork HTML, title / body / slide-number boxes
template.aliases;   // built-in layout → template layout
templateCss(template, "brand"); // the theme's CSS
```

## Limits

- Slides are 16:9. A 4:3 template is centered, and the sides are filled with its background color.
- Picture, chart and table placeholders stay empty, and so do date and footer placeholders.
- In an exported PPTX file, the template's artwork is drawn as shapes on each slide. It doesn't become a PowerPoint slide master.
