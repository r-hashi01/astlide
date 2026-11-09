---
"@astlide/core": patch
---

Layout engine (`check_deck`, PowerPoint export): a box with `aspect-ratio` and a percentage height now gets its width from that height when the height is definite, also inside a flex item stretched in its row, as Chromium lays it out.
