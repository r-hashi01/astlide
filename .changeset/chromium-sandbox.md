---
"@astlide/core": patch
---

PDF / PNG export runs Chromium with its sandbox on (Playwright turns it off by default). Where the system doesn't allow the user namespaces it needs, the export stops with how to allow them instead of running unsandboxed; `ASTLIDE_CHROMIUM_SANDBOX=0` opts out.
