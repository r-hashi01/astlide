---
"@astlide/core": patch
---

`astlide import --deck` and the MCP tool `import_pptx` accept only a plain folder name for the deck (letters, digits, `-`, `_`, `.`), checked before anything is read, and the deck and picture folders must stay inside `src/content/decks/` and `public/pptx/`.
