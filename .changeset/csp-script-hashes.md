---
"@astlide/core": minor
---

Built deck pages no longer allow `script-src 'unsafe-inline'`: after `astro build`, each page's inline scripts — Astlide's, Astro's and any a slide brings — are allowed by their SHA-256 hashes in the default CSP. Inline event-handler attributes (`onclick="…"`) and `javascript:` URLs in slides no longer run in built pages; use a `<script>` instead, or set your own `csp` string. `astro dev` and custom `csp` strings are unchanged. The configuration reference also explains how to send `frame-ancestors` as a header.
