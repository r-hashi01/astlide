---
"@astlide/core": patch
---

The print view (`/<deck>/all`, what PDF exports render) no longer plays slide transitions: a slide with `transition: zoom` was scaled down while it animated in, and an export could capture it that way.
