---
"@astlide/core": patch
---

MCP: `check_deck` is no longer marked read-only (it builds the site by default); `render_deck` only writes inside the project (`outDir` outside it is refused); `check_deck` links nothing outside its temporary folder when resolving a built page under a base path.
