---
title: Import PowerPoint & Google Slides
description: Show a .pptx as Astlide slides, or turn it into an editable deck.
---

Astlide reads PowerPoint files: each page becomes an Astlide slide, with its text kept as text and its shapes, pictures and tables in place. Placeholders get their position and text style from the slide layout and master, theme colors and fonts are resolved, and speaker notes, titles and hidden slides carry over.

Google Slides and Keynote work through their PowerPoint export. To write new slides in Markdown with a template's design, see [PowerPoint templates](/guides/templates/).

## Show a .pptx as it is

Put the file in a deck folder, next to your other slides:

```
src/content/decks/q3-review/
├── _config.json
├── 01-intro.md
├── 02-numbers.pptx      ← every page of it, in place
└── 03-next-steps.mdx
```

Its pages sort with the other files by name (`02-numbers.pptx` → `02-numbers--001`, `02-numbers--002` …), and presenter view, overview, notes and PDF / PPTX export work as for any slide. Edit the `.pptx` and the deck follows on save. Pictures and fonts embedded in the file are served by Astlide (from `/_astlide/pptx/`).

## Import into an editable deck

```bash
bunx astlide import ~/Downloads/kickoff.pptx --deck kickoff
```

This writes one `.html` slide per page to `src/content/decks/kickoff/` (title, notes and `hidden` in frontmatter, one shape per line), pictures to `public/pptx/kickoff/`, and a `_config.json`. From then on the slides are plain files: edit them, mix in Markdown slides, change the theme.

| Option | |
|---|---|
| `--deck <name>` | Deck folder name (default: from the file name) |
| `--force` | Replace an existing deck folder |
| `--cwd <dir>` | Project root (default: found from the current directory) |

### Google Slides

Pass the deck's URL. It is downloaded as PowerPoint, which works when the deck is shared as "Anyone with the link"; otherwise download it (File → Download → Microsoft PowerPoint) and import the file.

```bash
bunx astlide import https://docs.google.com/presentation/d/1AbC…/edit
```

## From code

```ts
import { pptxToSlides } from "@astlide/core/pptx";

const deck = pptxToSlides(await readFile("talk.pptx"), {
  // Where pictures and embedded fonts go (default: pictures inlined as data: URLs).
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

Charts, SmartArt and embedded objects show as a marked frame, and EMF / WMF pictures (which browsers can't display) as an outline — re-insert those as pictures. Slides other than 16:9 are letterboxed.
