# @astlide/engine

## 0.1.3

### Patch Changes

- [#209](https://github.com/r-hashi01/astlide/pull/209) [`105a216`](https://github.com/r-hashi01/astlide/commit/105a216205a363164b714431ef3d5478cfd54002) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PPTX export lays out a same-site iframe only from a page inside the built site: for an iframe pointing at the site's root folder, the `<dist>.html` file next to it is no longer considered.

  Reading files of the built site (stylesheets, same-site iframe pages) also refuses symlinks inside `dist/` that point elsewhere.

## 0.1.2

### Patch Changes

- [#159](https://github.com/r-hashi01/astlide/pull/159) [`01c0b37`](https://github.com/r-hashi01/astlide/commit/01c0b374695aa46d23776c0fe735c4f24fa47e9b) Thanks [@r-hashi01](https://github.com/r-hashi01)! - The docs moved to https://astlide.dev/ (package `homepage`, README links).

- [#184](https://github.com/r-hashi01/astlide/pull/184) [`834d12f`](https://github.com/r-hashi01/astlide/commit/834d12f7ceb7c4dcdad65b5d6d5988ba6edf7495) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Hardening: `<astlide-deck>` (and the React / Vue wrappers) only loads `http(s)` or relative `src` URLs; presenter sync checks incoming messages and is scoped to the site's base path; `sanitizeHTML` now works on a parsed tree (unterminated tags and encoded `javascript:` URLs no longer get through) and the client-side notes sanitizer keeps only allowlisted attributes; the engine's `distFile` and same-site iframes / stylesheets stay inside `dist` (a sibling folder like `dist-old` no longer counts).

- [#167](https://github.com/r-hashi01/astlide/pull/167) [`d05498f`](https://github.com/r-hashi01/astlide/commit/d05498f027e646637ab776347796a7f4fcb3a444) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Hardening from the first CodeQL scan: KaTeX output is sanitized on a parsed tree (script elements however spelled, `on*` handlers, `javascript:` / `vbscript:` URLs even when entity-encoded); slide titles from HTML headings remove one level of escaping, not two; CSS font parsing and trailing-slash trimming no longer use backtracking-prone regexes; table cells in MCP imports escape backslashes too.

- [#191](https://github.com/r-hashi01/astlide/pull/191) [`e063de7`](https://github.com/r-hashi01/astlide/commit/e063de75ca23dedaf345e357291e7c0d539e0231) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PPTX export is sturdier against the pages and images a deck points to: embed-card links are http(s) only, page tags are read with a parser (linear time), URLs a remote response chose (an advertised oEmbed endpoint, thumbnails, `og:image`, redirects from a public server) must be public addresses, an embed or SVG that fails no longer aborts the export, SVG pictures above 50 megapixels are skipped, control characters XML can't hold are dropped, and Google Fonts downloads have a size cap and timeout.

- [#183](https://github.com/r-hashi01/astlide/pull/183) [`8b5dc4e`](https://github.com/r-hashi01/astlide/commit/8b5dc4ea75faf61d08a68b6b8d26e98bb935013c) Thanks [@r-hashi01](https://github.com/r-hashi01)! - SVG rasterized for PPTX export (remote SVG images, inline SVG) only draws in-document references and inline PNG / JPEG / GIF / WebP images; other image links, including file paths, are dropped.

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
