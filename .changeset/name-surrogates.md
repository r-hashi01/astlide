---
"@astlide/core": patch
---

`astlide import` and template layouts: a long name ending in a character outside the Basic Multilingual Plane (𠮷, emoji) is no longer cut in half, which made the import fail with `bad deck name`.
