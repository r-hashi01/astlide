---
"@astlide/core": minor
---

The markup and styles around a slide (toolbar, presenter panel, notes, overview, go-to and PDF overlays) are now framework-agnostic too: `@astlide/core/runtime/chrome` renders them as HTML strings and `@astlide/core/styles/deck.css` styles them (experimental, for the upcoming React / Next / Vue packages). Slide pages look and behave the same; the styles still never reach slide content.
