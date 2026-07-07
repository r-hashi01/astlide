---
"@astlide/core": minor
---

Add `injectIndexRoute` option and auto-skip the `/` index route when you have your own home page.

Astlide injects a deck-index page at `/`. If your project has its own
`src/pages/index.{astro,md,mdx,html}`, that previously produced an Astro route
collision warning (a hard error in future Astro).

- **Default (auto):** the `/` route is injected only when no user index page
  exists — a custom home page now works out of the box, no collision.
- `injectIndexRoute: false` — never inject; you own `/`.
- `injectIndexRoute: true` — always inject, even alongside your own index.
