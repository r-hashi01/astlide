---
"@astlide/core": patch
---

Slide links follow Astro's `trailingSlash` / `build.format`: with the default `directory` format they end in `/`. Static hosts such as GitHub Pages no longer answer every navigation, prefetch, overview thumbnail and presenter preview with a 301 redirect.
