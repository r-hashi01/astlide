---
"@astlide/core": patch
---

Layout engine and PowerPoint export: form controls (`<button>` …) reset `line-height`, `font-weight` and `font-style` as in a browser; a font loaded from Google Fonts without italics is slanted for italic text (as a browser does) instead of measured with an italic face the page doesn't load; and italic text exports as italic even without an italic font file.
