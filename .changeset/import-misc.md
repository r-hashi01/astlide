---
"@astlide/core": patch
---

PowerPoint import: numbered sub-items start again at `a.` after a higher-level item, as in PowerPoint; full-circle arcs in custom shapes are drawn; unreadable colors (an unknown highlight, `srgbClr` values that aren't six hex digits) are left out instead of writing `null` / `NaN` into the CSS.
