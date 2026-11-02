---
"@astlide/core": patch
"@astlide/astro": patch
"@astlide/react": patch
"@astlide/vue": patch
"@astlide/next": patch
"@astlide/nuxt": patch
---

`@astlide/core/runtime/page` exports `slideUrl()`, `slideNeighbours()` and `noNotesText()`: a slide page's URL, its previous / next / first / last slides and the "no notes" text, computed one way for Astro, React, Vue, Next, Nuxt and the runtime. Astro slide pages now encode the deck name in their toolbar and presenter links, as the runtime already did.
