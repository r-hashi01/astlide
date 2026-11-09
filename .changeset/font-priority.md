---
"@astlide/core": patch
---

`check_deck` and PowerPoint export fetch the fonts slides use before fallbacks: the first family of each `font-family` list comes first. Before, fallback names such as `SFMono-Regular` and `Segoe UI` used up the 12 Google Fonts families, and a theme's own fonts (e.g. Geist, Noto Sans JP) weren't fetched.
