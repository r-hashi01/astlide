---
"@astlide/next": patch
"@astlide/nuxt": patch
"@astlide/core": patch
---

Speaker notes stay out of production pages by default, as in the Astro integration: `createDeckRoutes()` and the Nuxt module take `notes: "dev" | "public"` (default `"dev"`). With `"dev"`, production pages, the print view and Nuxt's bundles carry no notes, from frontmatter, trailing comments or `<SpeakerNotes>`. Set `notes: "public"` to keep them, for example to export a PPTX with notes from a production server.

`compileSlideMdx()` and `evaluateSlideMdx()` take `notes: false` to leave `<SpeakerNotes>` / `<Notes>` blocks out of the compiled code.
