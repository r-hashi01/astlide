---
"@astlide/core": minor
---

`@astlide/core/deck/pages` adds `slidePage(deck, n)` and `printSlides(slides)`. They decide, the same way for every framework, which slide is page `n`, where navigation goes, the go-to outline, the deck context and the slides of the print view. Hidden slides keep their number and redirect onward in production. The Astro, Next.js and Nuxt pages all use them, so Next.js and Nuxt now number hidden slides as Astro does. Before, they renumbered the rest.
