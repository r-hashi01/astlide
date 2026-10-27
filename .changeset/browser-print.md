---
"@astlide/core": patch
---

Printing a deck from the browser (Save as PDF) fits each slide to the paper — also on A4 / Letter and in Safari, which ignores the `@page` size — instead of cropping it at 1920px, and a slide change in progress no longer prints over the new slide (doubled text). `astlide export --pdf` output is unchanged.
