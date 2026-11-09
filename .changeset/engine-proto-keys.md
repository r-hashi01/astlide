---
"@astlide/core": patch
---

`check_deck` and the PowerPoint export no longer fail on CSS values named like JavaScript object properties (`font-family: constructor`, `font-weight: __proto__`, `list-style-type: constructor`, an SVG `fill="constructor"` …): such values are unknown, as in browsers.
