---
"@astlide/core": patch
---

Expose the exporters as commands: `bunx astlide-export` (PDF / PNG) and `bunx astlide-export-pptx` (PowerPoint). They were documented but not registered as package `bin`s, so they couldn't be run from a project. Both run with Bun.
