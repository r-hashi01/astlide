---
"@astlide/core": minor
---

Add `@astlide/core/templates`: a store that keeps PowerPoint templates by name, with every uploaded version. `createTemplateStore(dir)` keeps them in a folder; implement `TemplateStore` to keep them elsewhere. The render service uses it for its new `/templates` routes.
