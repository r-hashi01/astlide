---
"@astlide/core": patch
---

The runtime sanitizes speaker notes with the same rules as the build: `id` attributes are dropped, `href` / `src` may not be protocol-relative (`//host`, `/\host`), a kept `target` gets `rel="noopener noreferrer"`, and HTML comments are removed. Both sanitizers now read one policy, so they can't drift apart again.
