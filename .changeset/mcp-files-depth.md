---
"@astlide/core": patch
---

MCP: `template_layouts` and `import_pptx` only read files inside the folders the server may work in (regular files, the right extension, at most 256 MB, symlinks resolved). Projects must be one of those folders or directly in one — a deeper project needs its own `--root`. `import_pptx` names and checks the deck itself, and projects with an `@astlide/core` older than 2.8.0 are written with the server's own CLI. `/Users/Shared` and `C:\Users\Public` count as too broad, like the home and temp folders.
