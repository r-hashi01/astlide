---
"@astlide/core": minor
---

Pen drawings can persist: `astlide({ drawings: { persist: true } })` keeps them in `localStorage` per deck, so they survive reloads and come back the next time the deck is opened in that browser (off by default). `Shift+C` (with the pen active) now clears the whole deck's drawings.
