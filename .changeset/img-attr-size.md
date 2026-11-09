---
"@astlide/core": patch
---

Layout engine (`check_deck` and the PowerPoint export): the `width` / `height` attributes of pictures, SVGs, videos and frames size them like CSS any rule overrides, as in browsers — an `<img width="100" height="1000">` in a column flexbox is no longer stretched to the full width; `width="50%"` works. Frames get the browser's 2px border.
