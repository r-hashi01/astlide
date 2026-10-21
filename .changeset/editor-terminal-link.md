---
"@astlide/core": patch
---

The dev slide editor now also needs a browser enabled through a link `astro dev` prints once at startup (its key is kept in `node_modules/.astro/`, and the browser stays enabled across restarts). Without it the editor shows how to turn editing on and saves nothing — even for requests relayed to the dev server over a raw port forward.
