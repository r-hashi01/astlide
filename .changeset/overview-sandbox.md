---
"@astlide/core": patch
---

Overview thumbnails no longer use `sandbox="allow-same-origin allow-scripts"`. It gave no isolation for same-origin frames and logged a console warning per slide. Thumbnails render in embed mode, like the presenter's next-slide preview.
