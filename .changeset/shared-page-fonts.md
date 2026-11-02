---
"@astlide/core": patch
---

`check_deck` lays slides out with the same fonts as the PPTX export: an emoji fallback and, for Japanese / Chinese / Korean text, the CSS's CJK font or Noto Sans JP. Before, it measured East Asian text with whatever fallback it had, so a slide could pass the check and overflow in PowerPoint (or the reverse). Both use the engine's new `loadPageFonts()`.
