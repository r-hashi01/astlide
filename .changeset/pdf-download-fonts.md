---
"@astlide/core": patch
"@astlide/astro": patch
---

The toolbar's PDF download no longer draws each slide's text twice, and keeps Japanese text: `@astlide/crispdf` 0.0.3 captures the print view in its own document, and the deck page's CSP lets it fetch fonts from Google Fonts. Text no font can draw stays in the image instead of disappearing.
