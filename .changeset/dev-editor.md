---
"@astlide/core": minor
---

Edit slides in the browser while developing: in `astro dev`, press `e` to open the current slide's source next to it and `Cmd/Ctrl+S` to save — the file is written and the slide reloads. The panel follows you across slides. Dev-only: the editor and its endpoint are not part of production builds, and they only read/write slide files under `src/` from the dev server's own origin.
