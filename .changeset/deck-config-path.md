---
"@astlide/core": patch
"@astlide/astro": patch
---

Astro builds read each deck's `_config.json` from where its slides are, so a custom `srcDir`, the loader's `base`, or running `astro build --root` from another folder no longer drops the decks' titles and themes (or fails on the deck index). `@astlide/core/deck/files` exports `readDeckConfig()`.
