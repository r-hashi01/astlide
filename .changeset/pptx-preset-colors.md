---
"@astlide/core": patch
---

PowerPoint import: every preset color (`a:prstClr`, such as `ltGray` or `medSeaGreen`) is read; only ten were known, so shapes in the others lost their color. The layout engine no longer throws on `color: constructor` (a CSS color named like an object property).
