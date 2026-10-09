---
"@astlide/core": minor
---

New `favicon` option. Deck pages, the deck index and the print view now link a favicon: by default `favicon.svg` / `.ico` / `.png` from `public/`, with Astro's `base` applied. Without one, they use an empty icon, so browsers no longer request `/favicon.ico` at the domain root (a 404 under a sub-path such as GitHub Pages). Pass a path or URL to choose one, or `false` for no link.
