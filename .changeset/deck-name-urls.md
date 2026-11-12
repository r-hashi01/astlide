---
"@astlide/astro": patch
---

A deck folder named with `#`, `?` or `%` stops the build with an error naming it (it used to fail with a file-not-found or an Astro module error). Other names are encoded in the deck index's links and in hidden slides' redirects (`/q%203/1/` for a folder `q 3`).
