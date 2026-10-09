---
"@astlide/core": minor
"@astlide/engine": minor
---

One export command, one option per format: `astlide export <deck> --pdf | --png | --pptx`.

- `--pptx` now lays out the built slides with the new `@astlide/engine` (CSS cascade, flexbox and font-metric line breaking, no browser) and writes native shapes and editable text boxes in the theme's fonts, so the PowerPoint matches the slides instead of a re-styled copy of the Markdown. It replaces the source-based exporter, which skipped `.md` / `.html` slides.
- The fonts the slides use are embedded in the `.pptx`, so PowerPoint shows them without the fonts installed.
- Mermaid diagrams and SVG images are included (rendered without a browser).
- The older `astlide-export` and `astlide-export-pptx` commands are removed; use `astlide export`.
