---
"@astlide/astro": patch
---

A project in a folder whose path has a space (or another character URLs escape) keeps its own `src/pages/index` page, without a warning about a missing content config. With a custom `srcDir`, the dev slide editor saves slides again.
