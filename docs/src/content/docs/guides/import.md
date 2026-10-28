---
title: Import PowerPoint & Google Slides
description: Show a .pptx as Astlide slides, or turn it into an editable deck.
---

Astlide can read PowerPoint (`.pptx`) files in two ways. You can drop a `.pptx` into a deck and show its pages as they are, or import it once into `.html` slides that you edit from then on.

Either way, each page becomes one Astlide slide. Text stays real text, and shapes, pictures and tables keep their positions. Placeholders take their position and text style from the slide layout and master. Theme colors and fonts are applied, and speaker notes, slide titles and hidden slides carry over.

Only `.pptx` is read. For Google Slides, Keynote, `.ppt` or `.odp`, save or download the deck as PowerPoint first; Google Slides can also be imported from its URL ([below](#google-slides)). If you want to write new slides in Markdown that use a PowerPoint design, see [PowerPoint templates](/guides/templates/).

:::note
Both ways need the `decks` collection to use `astlideDeckLoader()` (see [Getting Started](/getting-started/#add-to-an-existing-astro-project)). A project created with `bun create astlide` loads only `.mdx` files until you switch.
:::

## Show a .pptx as it is

Put the file in a deck folder next to your other slides:

```
src/content/decks/q3-review/
├── _config.json
├── 01-intro.md
├── 02-numbers.pptx      ← every page of it, in place
└── 03-next-steps.mdx
```

Each page of the file becomes a slide named after it: `02-numbers--001`, `02-numbers--002` and so on. They sort by file name along with the other slides, so here they come after `01-intro.md` and before `03-next-steps.mdx`.

These slides work like any other slide in the presenter window, overview, notes and PDF / PPTX export. When you save a change to the `.pptx`, the deck updates. Astlide serves the pictures and fonts embedded in the file from `/_astlide/pptx/`.

## Import into an editable deck

```bash
bunx astlide import ~/Downloads/kickoff.pptx --deck kickoff
```

The command writes these files:

- `src/content/decks/kickoff/`: one `.html` slide per page, with the title, notes and `hidden` in frontmatter and one shape per line, plus a `_config.json`
- `public/pptx/kickoff/`: the pictures

After that the slides are ordinary files. You can edit them, add Markdown slides to the deck and change the theme.

| Option | |
|---|---|
| `--deck <name>` | Deck folder name (default: derived from the file name) |
| `--force` | Replace the deck folder and its pictures if they already exist |
| `--cwd <dir>` | Project root (default: the nearest folder at or above the current one that has `src/content/decks`) |

### Google Slides

Pass the deck's URL instead of a file. Astlide downloads it as PowerPoint and imports it:

```bash
bunx astlide import https://docs.google.com/presentation/d/1AbC…/edit
```

The download only works when the deck is shared as "Anyone with the link". For a private deck, use **File → Download → Microsoft PowerPoint (.pptx)** in Google Slides and import that file.

## From code

```ts
import { readFile } from "node:fs/promises";
import { pptxToSlides } from "@astlide/core/pptx";

const deck = pptxToSlides(await readFile("talk.pptx"), {
  // Where pictures and embedded fonts go: return a URL, or null to leave the file out.
  // Default: pictures inlined as data: URLs, embedded fonts left out.
  media: ({ name, data, type }) => saveSomewhere(name, data, type),
});
deck.slides[0].html;   // an Astlide .html slide body (1920×1080)
deck.slides[0].notes;  // speaker notes
deck.theme;            // the master's theme colors and fonts
```

## What converts

| In PowerPoint | In Astlide |
|---|---|
| Text boxes and placeholders: fonts, sizes, colors, bold / italic / underline, alignment, bullets and numbering, spacing, links | Positioned text |
| Rectangles, rounded rectangles, ellipses, arrows, callouts, common preset shapes, freeforms | CSS boxes and SVG |
| Solid, gradient, picture, tiled and pattern fills; outlines, dashes, arrowheads | CSS / SVG |
| Pictures (PNG, JPEG, GIF, SVG), cropping | `<img>` |
| Tables: cell fills, borders, merged cells | `<table>` |
| Groups, rotation, flips | Transforms |
| Backgrounds (slide, layout, master), master and layout artwork | The slide canvas |
| Embedded fonts | `@font-face` |

Some content doesn't convert. Charts, SmartArt and embedded objects appear as a dashed frame labeled "Chart", "SmartArt" or "Object". Pictures in formats browsers can't display, such as EMF and WMF, appear as an empty dashed frame. To keep any of these, replace them with pictures (PNG or SVG) in PowerPoint. Slides that aren't 16:9 are letterboxed.
