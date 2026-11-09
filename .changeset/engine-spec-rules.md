---
"@astlide/core": patch
---

`check_deck` and PowerPoint export lay out more like browsers do:

- A border with a style but no width is 3px wide, as in browsers.
- `word-break` and `overflow-wrap` set on a parent apply to its text, and so do `font-variant-numeric` / `font-feature-settings` (such as `tabular-nums`).
- Japanese lines may break before small kana and `ー`, and between elements (`日本<b>語</b>`); a line that can't break right before the word that doesn't fit breaks at the last place it can.
- An image limited by `max-height` keeps its proportions.
