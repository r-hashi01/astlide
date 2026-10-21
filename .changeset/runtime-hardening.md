---
"@astlide/core": minor
---

New `notes` option: `notes: "dev"` keeps speaker notes out of built pages (they are public by default — now documented). Hardening: the `/[deck]/all` page gets the CSP too, and the default policies add `base-uri 'self'; form-action 'self'; object-src 'none'`; the share / print toggle builds its URL from the slide number; `<Tweet>` links / avatars and `<YouTube>` ids are validated; `sanitizeKaTeXOutput` also strips non-math elements (`noscript`, `iframe`, `object`, SVG `animate` …) and `data:` URLs; `sanitizeHTML` drops `id`, refuses protocol-relative links and adds `rel="noopener noreferrer"` to kept `target`s; saved drawings are validated before use.
