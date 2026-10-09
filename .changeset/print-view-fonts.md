---
"@astlide/core": patch
---

The print view (`/<deck>/all`), which PDF exports render, now loads the deck's web font (`font` option, Inter by default), like the slide pages. Before, exported PDFs used whatever font the machine had installed. The deck index also follows the `font` option now.
