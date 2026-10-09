---
"@astlide/core": patch
---

The print view (`/<deck>/all`), which PDF exports render, now loads the deck's web font (`font` option, Inter by default), like the slide pages. Before, exported PDFs used whatever font the machine had installed. The deck index also follows the `font` option now.

The default `font` stylesheet also loads JetBrains Mono, the built-in themes' code font. Code blocks used to fall back to the system monospace font, which in exported PDFs was often Courier and looked lighter and smaller than on screen.
