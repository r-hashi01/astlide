---
"@astlide/core": patch
---

Layout engine (`check_deck` and the PowerPoint export) reads more CSS values as browsers do: `flex: initial`, the `xx-small` / `x-small` / `xxx-large` font sizes, dynamic / small / large viewport units (`dvh`, `svw` …), `hsl()` / `hwb()` with negative hues; a 5-digit hex color is invalid, and `background` position / repeat keywords aren't taken for its color.
