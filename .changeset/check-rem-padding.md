---
"@astlide/core": patch
---

`check_deck` reports content running into the slide's padding when the padding is in `rem` or `em` — including the default theme's `4rem`, which it used to read as 4px.
