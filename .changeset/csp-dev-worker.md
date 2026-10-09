---
"@astlide/core": patch
---

Dev: the default (or custom) CSP now allows `blob:` workers during `astro dev` (`worker-src 'self' blob:`, unless the policy sets `worker-src`). Vite's client was blocked from starting its reconnect worker, which logged CSP errors and left background tabs, such as the presenter window, stuck after a dev server restart. Built output is unchanged.
