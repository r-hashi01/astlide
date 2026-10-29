---
"@astlide/core": minor
---

`astlide export --base-url` works for sites built without Astro (Next.js, Nuxt, React, Vue). Outside an Astro project, every format comes from the running site. PDF and PNG are rendered from its pages. PPTX is made from its print view (`/<deck>/all`), with the same engine and output as an Astro build. A deck is checked against the site instead of `src/content/decks`. Use the site's production server for PPTX.
