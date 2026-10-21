---
"@astlide/core": patch
---

MCP: the folder the server was started in no longer counts as an allowed project folder when it is the filesystem root or the home folder (or above it) — where clients often start servers. Name the folders with `astlide mcp --root <dir>` (repeatable) or `ASTLIDE_MCP_ROOTS`; clients that send MCP roots (Claude Code) need nothing. The filesystem root never counts as a root.
