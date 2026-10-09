---
title: Export
description: Export decks to PDF, PNG or PowerPoint.
---

## One command

```bash
bunx astlide export my-talk                 # → exports/my-talk.pdf
bunx astlide export my-talk --pptx          # → exports/my-talk.pptx (editable PowerPoint)
bunx astlide export my-talk --png           # → exports/my-talk-slides/*.png
bunx astlide export --all --pdf --pptx      # every deck, both formats
```

Projects created with `bun create astlide` also have it as a script: `bun run export my-talk --pptx`.

A deck can also be given as a path (`src/content/decks/my-talk`, `dist/my-talk`, …); the project is found from it, as it is when you run the command in any folder inside the project.

- **PDF / PNG** are rendered in a headless browser ([Playwright](https://playwright.dev); run `bunx playwright install chromium` once). `astlide export` builds your site and serves it on a free port for the export, so there's no server to start, and Astro's [`base`](/astlide/guides/deploy/) is picked up automatically. Every slide is shown in its final state (all fragment / code steps applied), and diagrams finish rendering first.
- **PPTX** needs no browser: the built slides are laid out by Astlide's own CSS layout engine and written as native shapes and editable text boxes. The fonts your theme loads are embedded in the file, so PowerPoint shows the slides in them without the fonts installed (fonts whose license forbids embedding are left out).

| Option | |
|---|---|
| `--pdf` `--pptx` `--png` | Formats, combine as needed (default `--pdf`) |
| `--all` | Every deck |
| `--out-dir <dir>` | Where exports go (default `exports/`) |
| `-o, --output <path>` | Exact output path (one deck, one format) |
| `--no-build` | Use the existing `dist/` instead of building first |
| `--base-url <url>` | PDF / PNG: render from a dev / preview server you already run (include the `base`, e.g. `http://localhost:4321/my-repo`) |
| `--width` / `--height` | PDF / PNG: slide size in px (default 1920×1080) |

If `astro dev` is running for the same project, pass `--base-url` so a PDF / PNG export doesn't build alongside it.

## In-browser PDF (experimental)

Add `"download"` to the [toolbar](/astlide/guides/presenting/#toolbar) for a one-click PDF of the current deck. It uses the optional, pre-1.0 [`@astlide/crispdf`](https://www.npmjs.com/package/@astlide/crispdf), whose output may still change — prefer the CLI for stable results.

```bash
bun add -D @astlide/crispdf
```
