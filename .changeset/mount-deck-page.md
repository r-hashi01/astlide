---
"@astlide/core": patch
"@astlide/react": patch
"@astlide/vue": patch
---

`@astlide/core/runtime/deck-page` exports `mountDeckPage()` and `setUpDeckPageTools()`: what a framework's slide page does around the runtime (page flags, the `<body>` data exporters read, diagrams, media buttons, camera, recording and PDF download). `@astlide/react` and `@astlide/vue` use them instead of their own copies. Vue's `DeckPage` now mounts again when `loadMermaid` changes, as React's does, so diagrams draw when the loader is set after mounting.
