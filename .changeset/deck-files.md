---
"@astlide/core": patch
"@astlide/astro": patch
---

The deck loader skips Office lock files (`~$talk.html`) for every slide format, as the deck reader does. `@astlide/core/deck/files` has `DECKS_DIR`, `decksDir()`, `decksDirIn()`, `filesIn()` and `pptxSlideId()`.
