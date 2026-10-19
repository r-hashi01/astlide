---
title: PowerPoint templates
description: Use a PowerPoint or Google Slides template as a theme, and write the slides in Markdown.
---

Register a PowerPoint template as a theme, and Markdown slides come out in its design: the template's backgrounds and artwork, its theme colors and fonts, and its slide numbers. Each slide's content goes where the template's placeholders are, with their text style.

```js
// astro.config.mjs
import astlide from "@astlide/core";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    astlide({
      templates: { brand: "./templates/brand.pptx" },
    }),
  ],
});
```

```json
// src/content/decks/q3-review/_config.json
{ "title": "Q3 review", "theme": "brand" }
```

The template can be a `.pptx`, a `.potx` template, or an Office theme file (`.thmx`). For Google Slides, download the template with File → Download → Microsoft PowerPoint. Editing the file reloads the deck in `astro dev`.

## Where content goes

In a slide, the first heading goes into the layout's title placeholder and everything else into its body placeholder, styled like the template's text: font, size, color, alignment and insets.

```md
---
slideLayout: default
---

# What we shipped        ← the title placeholder

- Import PowerPoint      ← the body placeholder
- Templates as themes
```

In a layout with two content placeholders side by side, `<Left>` and `<Right>` fill them, with the template's gap between them. A layout's slide-number placeholder shows the slide's number.

## Layouts

The built-in layouts use the template's own:

| `slideLayout` | Template layout |
|---|---|
| `cover` | Title Slide |
| `section` | Section Header |
| `default` | Title and Content |
| `two-column` | Two Content |
| `code` | Title Only (else Title and Content) |

They are found by the layout's type in PowerPoint, or by name ("Title slide", "Section header" …), as in Google Slides exports. Every layout of the template is also available by its name as a slug: `slideLayout: comparison`, `slideLayout: title-only`, `slideLayout: picture-with-caption` …

Other built-in layouts (`quote`, `statement`, `image-left` …) keep their own arrangement on the template's master background. A slide with its own `background` shows that instead of the template's artwork.

## Theme variables

The template's theme sets the theme variables, so components and custom CSS follow it:

| Variable | From the template |
|---|---|
| `--color-background` / `--color-foreground` | Light 1 / Dark 1 |
| `--color-primary` / `--color-accent` | Accent 1 / Accent 2 |
| `--color-secondary` / `--color-muted` | Dark 2 / Light 2 |
| `--font-heading` / `--font-body` | Heading / body font |
| `--font-size-base` / `--font-size-h1` | Body / title text size of Title and Content |

Install the template's fonts where the slides are viewed (or embed them in the template: PowerPoint's "Embed fonts in the file"), as for any theme.

## From code

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

- Slides are 16:9. A 4:3 template is drawn centered, with its background color at the sides.
- Placeholders for pictures, charts and tables, and date and footer placeholders, are not filled.
- Exported PPTX files draw the template's artwork as shapes, not as a PowerPoint master.
