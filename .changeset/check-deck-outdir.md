---
"@astlide/core": patch
---

`check_deck` builds into a folder of its own (`node_modules/.astro/astlide-check`), so it works with any Astro `outDir` and `build.format: "file"` — it used to fail with "no built deck" — and leaves your `dist/` alone. With `build: false` it reads its last build, else `dist/`.
