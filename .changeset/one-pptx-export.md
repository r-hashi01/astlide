---
"@astlide/core": minor
"@astlide/engine": minor
---

One export command, one option per format: `astlide export <deck> --pdf | --png | --pptx`.

- `--pptx` now lays out the built slides with the new `@astlide/engine` (CSS cascade, flexbox and font-metric line breaking, no browser) and writes native shapes and editable text boxes in the theme's fonts, so the PowerPoint matches the slides instead of a re-styled copy of the Markdown. It replaces the source-based exporter, which skipped `.md` / `.html` slides.
- The fonts the slides use are embedded in the `.pptx`, so PowerPoint shows them without the fonts installed.
- Tables become native PowerPoint tables; simple inline SVG drawings (boxes, lines and arrows, paths, text) become editable shapes; `::before` / `::after` content is included.
- Background images (`background-size` / `-position`, cropped to their box) and linear-gradient backgrounds are included.
- Embeds: `<YouTube>` exports as its thumbnail with a play button, linked to the video (in PDFs too); mark your own stand-in for any embed with `data-astlide-static`. Iframes of your own site (`srcdoc` or a built page) are laid out inside the frame; other sites become their thumbnail and title (oEmbed / Open Graph, cached), or a linked card offline. `overflow: hidden` clips what's drawn. Remote and JPEG images are included.
- Mermaid diagrams and SVG images are included (rendered without a browser).
- The older `astlide-export` and `astlide-export-pptx` commands are removed; use `astlide export`.
