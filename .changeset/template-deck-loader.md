---
"create-astlide": patch
---

New projects load every slide format. The template's `src/content.config.ts` now uses `astlideDeckLoader()`, so `.md` and `.html` slides, `.pptx` files in a deck and slides written by `astlide import` show up. Before, it used a `.mdx`-only `glob()` loader.
