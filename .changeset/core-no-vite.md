---
"@astlide/core": major
"@astlide/astro": major
---

`@astlide/core` no longer references Vite. Its two Vite plugins, `astlideCommentNotesPlugin` (from `utils/comment-notes`) and `astlideSlideScriptsPlugin` (from `utils/slide-scripts`), move into `@astlide/astro`, the only package that uses them.
