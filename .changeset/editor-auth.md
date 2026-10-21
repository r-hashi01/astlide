---
"@astlide/core": patch
---

The dev slide editor's endpoint now answers only local requests — from the machine running `astro dev`, addressed to `localhost` / `127.0.0.1` and not relayed by a proxy or tunnel — from the dev server's own pages, carrying the dev server's per-start token (which only those pages can fetch); it no longer follows symlinks out of `src/`. Viewing slides from other devices with `astro dev --host` or through a tunnel is unchanged; the editor works only at `localhost` on the machine running the dev server.
