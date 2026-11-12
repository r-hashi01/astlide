---
"@astlide/astro": patch
---

Works with Astro 7.4.11, which moved its island scripts to `@astrojs/runtime`: the integration no longer fails to load with `Cannot find module 'astro/runtime/client/idle.prebuilt.js'`. It now finds those scripts wherever the installed Astro keeps them.
