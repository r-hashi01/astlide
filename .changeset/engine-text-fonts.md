---
"@astlide/core": patch
---

`check_deck` and PowerPoint export measure text more like browsers do:

- A character the first font doesn't draw comes from the next font in the `font-family` list. For Google Fonts this also applies to characters the font's subsets leave out (Geist has no `→`).
- Fonts are loaded in every weight the deck uses, and `font-variant-numeric` / `font-feature-settings` (such as `tabular-nums`) apply.
- Fullwidth punctuation next to other punctuation is half-width (`」「`), as in Chromium.
- `white-space: nowrap` and `pre` keep text on one line.
- The `font` shorthand (`font: 1.2em/1.5 serif`), `zoom`, and `border-style: none` (no border width) apply.
