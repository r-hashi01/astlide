# @astlide/engine

## 0.1.1

### Patch Changes

- [#134](https://github.com/r-hashi01/astlide/pull/134) [`00ce654`](https://github.com/r-hashi01/astlide/commit/00ce6546e2fc4aa312e7838f3d261514b7ee8fee) Thanks [@r-hashi01](https://github.com/r-hashi01)! - npm metadata: descriptions mention presentations and editable PowerPoint export, more keywords (slides, presentation, pptx, powerpoint, astro-loader …), and `homepage` points to the docs site.

- [#121](https://github.com/r-hashi01/astlide/pull/121) [`7e291b9`](https://github.com/r-hashi01/astlide/commit/7e291b9dedf47298897d4a09557233e417b60af9) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PPTX export: fonts, caps, hatches and list markers.

  - A font the slides ask for but the exporter doesn't have (e.g. Office fonts like Calibri from a PowerPoint template) is now named in the PPTX, so PowerPoint uses it where it's installed; text is measured with a common font of the same kind instead of whichever font was registered first. Generic families (`sans-serif`, `serif`, `monospace`, `system-ui`) resolve to common fonts.
  - `text-transform` (uppercase / lowercase / capitalize) is applied.
  - Hatched backgrounds (`repeating-linear-gradient` lines, as imported PowerPoint pattern fills draw them) are exported as PowerPoint pattern fills instead of a solid color.
  - List markers sit on the item's first line also with a tight `line-height`.
  - `@astlide/engine` ships a README and LICENSE.

- [#144](https://github.com/r-hashi01/astlide/pull/144) [`b0dd0dd`](https://github.com/r-hashi01/astlide/commit/b0dd0ddd69a255e92c05b3a745f1b7bc7ca04bf8) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PPTX export fixes.

  - Sites with an Astro `base` (GitHub Pages project sites …) export: built files are found with or without the base path in their URLs (`distFile`).
  - Absolutely positioned boxes are placed against their nearest positioned ancestor, as in browsers, not their parent — `.pptx` pages shown in a deck are no longer shifted by the slide's padding. `position: relative` offsets apply.
  - `currentColor` in borders, backgrounds and outlines resolves to the element's color; buttons and form fields get Chromium's default look.
  - `@astlide/core/utils/*` and `@astlide/core/internal/*` imports without an extension type-check (they map to the `.ts` files).

## 0.1.0

### Minor Changes

- [#105](https://github.com/r-hashi01/astlide/pull/105) [`2b68573`](https://github.com/r-hashi01/astlide/commit/2b685735ff81d6b306d7deb7b8eb619a59df148a) Thanks [@r-hashi01](https://github.com/r-hashi01)! - One export command, one option per format: `astlide export <deck> --pdf | --png | --pptx`.

  - `--pptx` now lays out the built slides with the new `@astlide/engine` (CSS cascade, flexbox and font-metric line breaking, no browser) and writes native shapes and editable text boxes in the theme's fonts, so the PowerPoint matches the slides instead of a re-styled copy of the Markdown. It replaces the source-based exporter, which skipped `.md` / `.html` slides.
  - The fonts the slides use are embedded in the `.pptx`, so PowerPoint shows them without the fonts installed.
  - Tables become native PowerPoint tables; simple inline SVG drawings (boxes, lines and arrows, paths, text) become editable shapes; `::before` / `::after` content is included.
  - Background images (`background-size` / `-position`, cropped to their box) and linear-gradient backgrounds are included.
  - Embeds: `<YouTube>` exports as its thumbnail with a play button, linked to the video (in PDFs too); mark your own stand-in for any embed with `data-astlide-static`. Iframes of your own site (`srcdoc` or a built page) are laid out inside the frame; other sites become their thumbnail and title (oEmbed / Open Graph, cached), or a linked card offline. `overflow: hidden` clips what's drawn. Remote and JPEG images are included.
  - Mermaid diagrams and SVG images are included (rendered without a browser).
  - The older `astlide-export` and `astlide-export-pptx` commands are removed; use `astlide export`.
