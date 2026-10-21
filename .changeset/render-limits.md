---
"@astlide/core": patch
---

PDF / PNG export reads two more settings from the environment (the render service sets them): `ASTLIDE_MAX_SLIDES` caps how many slides are rendered whatever count the page reports, and `ASTLIDE_CHROMIUM_SANDBOX=1` launches Chromium with its sandbox on.
