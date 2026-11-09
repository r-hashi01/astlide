---
"@astlide/core": patch
---

Layout engine (`check_deck` and the PowerPoint export): media queries match as in a desktop browser at the slide's size — range syntax (`(width < 768px)`), `em` / `rem` widths, `orientation`, `aspect-ratio`, `and` / `or` / `not` — so mobile styles no longer apply to slides; features it doesn't know don't match. `@supports not (…)` no longer applies.
