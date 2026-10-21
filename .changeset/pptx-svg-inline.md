---
"@astlide/core": patch
---

SVG pictures in `.pptx` decks and templates are inlined as `data:` URLs instead of being written to the site, and the `.pptx` asset route no longer serves SVG files (and sends `X-Content-Type-Options: nosniff`).
