---
"@astlide/core": minor
---

Built deck pages no longer allow `script-src 'unsafe-inline'`: after `astro build`, the inline scripts Astlide and Astro put on pages — and those of MDX slides and their components — are allowed by their SHA-256 hashes in the default CSP. **Behaviour change:** inline `<script>`s in Markdown, HTML and PowerPoint slides no longer run in built pages (the build warns), since that content can come from others; set the new `slideScripts: true` only for decks whose content you fully trust. Inline event-handler attributes (`onclick="…"`) and `javascript:` URLs in slides don't run either. `astro dev` and custom `csp` strings are unchanged. The configuration reference also explains how to send `frame-ancestors` as a header.
