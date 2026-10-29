---
"@astlide/core": minor
---

Export a deck folder without Astro: `renderDeck({ dir, format: "pptx" | "pdf" | "png", output, template? })` from `@astlide/core/render` (experimental) reads the deck, writes its print view with the same markup and styles as an Astlide site, and runs the same exporters as `astlide export` (the layout engine for PPTX, Chromium for PDF / PNG). Markdown, HTML and PowerPoint slides; MDX and slide decorators still need a build.
