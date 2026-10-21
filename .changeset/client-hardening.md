---
"@astlide/core": patch
"@astlide/engine": patch
---

Hardening: `<astlide-deck>` (and the React / Vue wrappers) only loads `http(s)` or relative `src` URLs; presenter sync checks incoming messages and is scoped to the site's base path; `sanitizeHTML` now works on a parsed tree (unterminated tags and encoded `javascript:` URLs no longer get through) and the client-side notes sanitizer keeps only allowlisted attributes; the engine's `distFile` and same-site iframes / stylesheets stay inside `dist` (a sibling folder like `dist-old` no longer counts).
