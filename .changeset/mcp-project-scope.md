---
"@astlide/core": patch
---

MCP server: `check_deck`, `render_deck` and `import_pptx` (with a project) only work on projects inside the client's MCP roots or the server's working directory (`ASTLIDE_MCP_ANY_PROJECT=1` allows any), say in their descriptions that they run the project's code, and give builds only the environment they need (no tokens or keys). Deck names follow the `astlide import` rule (no leading `-`) and reach `astlide export` after `--`; `outDir` and `astlide import` refuse folders that are symlinks out of the project; `import_pptx` is marked destructive.
