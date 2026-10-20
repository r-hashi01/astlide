---
"@astlide/engine": patch
"@astlide/core": patch
---

PPTX export fixes.

- Sites with an Astro `base` (GitHub Pages project sites …) export: built files are found with or without the base path in their URLs (`distFile`).
- Absolutely positioned boxes are placed against their nearest positioned ancestor, as in browsers, not their parent — `.pptx` pages shown in a deck are no longer shifted by the slide's padding. `position: relative` offsets apply.
- `currentColor` in borders, backgrounds and outlines resolves to the element's color; buttons and form fields get Chromium's default look.
- `@astlide/core/utils/*` and `@astlide/core/internal/*` imports without an extension type-check (they map to the `.ts` files).
