---
"@astlide/astro": patch
---

`@astlide/astro` declares `htmlparser2`, which it imports: package managers that don't hoist dependencies (pnpm, bun's isolated installs) could fail to load the integration.
