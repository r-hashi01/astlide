---
"@astlide/core": patch
---

`check_deck` and PowerPoint export apply CSS `transform` translations and scales (about `transform-origin`), including the `var()` chains UnoCSS and Tailwind write: a diagram at `scale(0.9)` is checked and exported at the size it's shown. Rotations and skews are still ignored.
