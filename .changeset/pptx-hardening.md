---
"@astlide/core": patch
---

Safer reading of PowerPoint files (.pptx / .potx / .thmx), which often come from other people: font names are limited to letters, digits and a few punctuation marks wherever they reach CSS or HTML; theme colors must be 6-digit hex; ZIP entries are inflated only when used and only up to their declared size, within per-entry and per-file budgets (entries sharing data are refused); a slide listed more than once is read once, and at most 2000 slides are read.
