---
"@astlide/core": patch
---

Fix `astlide export pptx` frontmatter parsing with js-yaml 5, which no longer provides a default export. `@types/js-yaml` is dropped since js-yaml 5 ships its own types.
