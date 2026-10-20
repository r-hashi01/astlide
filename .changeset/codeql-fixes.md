---
"@astlide/core": patch
"@astlide/engine": patch
---

Hardening from the first CodeQL scan: KaTeX output is sanitized on a parsed tree (script elements however spelled, `on*` handlers, `javascript:` / `vbscript:` URLs even when entity-encoded); slide titles from HTML headings remove one level of escaping, not two; CSS font parsing and trailing-slash trimming no longer use backtracking-prone regexes; table cells in MCP imports escape backslashes too.
