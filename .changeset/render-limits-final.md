---
"@astlide/core": patch
"@astlide/engine": patch
---

Exports are bounded further: PPTX downloads (images and embed previews) share one budget — 6 at a time, 200 MB and 200 distinct URLs in all; same-site iframes are laid out at most 32 documents per slide and never inside themselves; Google Fonts are limited to 12 families per export, cached under content hashes (written atomically, one file per download, the cache kept under 512 MB). Guarded PDF / PNG renders keep the page on its site (a refresh or redirect doesn't replace it), bound renderer processes and heap, disable DNS prefetch, and hold the download total exactly.
