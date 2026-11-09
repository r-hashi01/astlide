---
"@astlide/core": patch
"@astlide/nuxt": patch
"@astlide/next": patch
---

With Nuxt or Next, a key pressed while the next slide is still loading no longer moves from the slide being left (one ArrowLeft right after ArrowRight could go back two slides). Navigation keys pressed in that moment are ignored, as on a page load.
