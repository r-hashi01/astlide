---
"@astlide/engine": patch
"@astlide/core": patch
---

PPTX export: fonts, caps, hatches and list markers.

- A font the slides ask for but the exporter doesn't have (e.g. Office fonts like Calibri from a PowerPoint template) is now named in the PPTX, so PowerPoint uses it where it's installed; text is measured with a common font of the same kind instead of whichever font was registered first. Generic families (`sans-serif`, `serif`, `monospace`, `system-ui`) resolve to common fonts.
- `text-transform` (uppercase / lowercase / capitalize) is applied.
- Hatched backgrounds (`repeating-linear-gradient` lines, as imported PowerPoint pattern fills draw them) are exported as PowerPoint pattern fills instead of a solid color.
- List markers sit on the item's first line also with a tight `line-height`.
- `@astlide/engine` ships a README and LICENSE.
