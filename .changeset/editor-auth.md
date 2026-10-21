---
"@astlide/core": patch
---

The dev slide editor's endpoint now answers only requests from the machine running `astro dev` that carry the dev server's per-start token (given to its own pages), and no longer follows symlinks out of `src/`. Viewing slides from other devices with `astro dev --host` is unchanged; saving from the editor works only on the machine running the dev server.
