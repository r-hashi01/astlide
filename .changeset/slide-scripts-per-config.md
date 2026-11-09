---
"@astlide/core": patch
"@astlide/astro": patch
---

The `slideScripts` option belongs to its own Astro config: two configs in one process no longer share whichever was created last. `renderDeck` takes a `slideScripts` option. `setSlideScripts()` and `slideScriptsKept()` are gone from `@astlide/core/utils/slide-scripts`.
