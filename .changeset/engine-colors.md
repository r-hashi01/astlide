---
"@astlide/core": patch
---

PowerPoint export keeps colours written as `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()` (Tailwind v4's palette), `color()`, `color-mix()` and every CSS named colour; before, fills, borders and text in these were dropped. Rounded corners in `rem` / `vw` and an iframe's padding in any unit now use the page's own sizes.
