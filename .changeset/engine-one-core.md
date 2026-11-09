---
"@astlide/core": minor
---

`check_deck` and PowerPoint export use the new layout engine, which lays slides out by the CSS specifications rather than through a flexbox library, and so matches the browser much more closely: grid, tables, inline-block, baselines, `zoom`, images and Japanese line breaking come out where Chromium puts them. The `yoga-layout` dependency is gone.
