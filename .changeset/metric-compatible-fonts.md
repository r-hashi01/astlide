---
"@astlide/core": patch
---

The layout engine (`check_deck` and the PowerPoint export) measures Arial, Helvetica, Times New Roman, Courier New, Calibri and Cambria with metric-compatible open fonts (Arimo, Tinos, Cousine, Carlito, Caladea), so their text breaks into the same lines as in the browser; the exported text still names the original font. Form controls are measured in Arial, as Chromium draws them.
