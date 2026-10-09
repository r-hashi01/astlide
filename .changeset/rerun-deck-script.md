---
"@astlide/core": patch
---

Fix navigation after returning to a previously visited slide. Astro's ClientRouter skips inline scripts whose text already ran, so the deck runtime of a revisited slide never re-ran and kept the last slide's state — e.g. pressing → on slide 2 after visiting slide 3 jumped to slide 4, and scaling/fragments/notes were stale. The script is now marked `data-astro-rerun`.
