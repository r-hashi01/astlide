---
"@astlide/engine": patch
"@astlide/core": patch
---

PPTX export lays out a same-site iframe only from a page inside the built site: for an iframe pointing at the site's root folder, the `<dist>.html` file next to it is no longer considered.

Reading files of the built site (stylesheets, same-site iframe pages) also refuses symlinks inside `dist/` that point elsewhere.
