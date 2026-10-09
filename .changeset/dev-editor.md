---
"@astlide/core": minor
---

Live-edit slides in the browser while developing: in `astro dev`, press `e` to open the current slide's source next to it and type — edits are saved automatically and the slide updates without a page reload (caret, current step, camera and recording are kept). `Esc` saves and closes. Dev-only: the editor and its endpoint are not part of production builds, and they only read/write slide files under `src/` from the dev server's own origin.
