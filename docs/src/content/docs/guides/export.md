---
title: Export
description: Export decks to PDF, PNG or PowerPoint.
---

## PDF & PNG (CLI)

Requires [Playwright](https://playwright.dev) and [Bun](https://bun.sh) (the CLI runs from TypeScript source). Start the dev server (or a preview of your build), then:

```bash
bunx astlide-export --deck my-talk                  # → my-talk.pdf (single multi-page PDF)
bunx astlide-export --all                           # every deck
bunx astlide-export --deck my-talk --format png     # one PNG per slide
bunx astlide-export --deck my-talk --width 1280 --height 720
bunx astlide-export --deck my-talk --base-url http://localhost:3000
```

The PDF is rendered from the deck's print view, `/<deck>/all`, which stacks every slide with page breaks and shows each slide's final state (all fragment / code steps applied). Diagrams finish rendering before capture.

If your site uses a [`base` path](/astlide/guides/deploy/), include it in `--base-url`, e.g. `http://localhost:4321/my-repo`.

## PowerPoint

```bash
bunx astlide-export-pptx --deck my-talk                 # → dist/my-talk.pptx
bunx astlide-export-pptx --all
bunx astlide-export-pptx --deck my-talk --output ./slides/my-talk.pptx
```

Builds an editable `.pptx` directly from the MDX source — no dev server needed.

## In-browser PDF (experimental)

Add `"download"` to the [toolbar](/astlide/guides/presenting/#toolbar) for a one-click PDF of the current deck. It uses the optional, pre-1.0 [`@astlide/crispdf`](https://www.npmjs.com/package/@astlide/crispdf), whose output may still change — prefer the CLI for stable results.

```bash
bun add -D @astlide/crispdf
```
