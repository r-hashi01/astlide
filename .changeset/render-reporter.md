---
"@astlide/core": patch
---

`renderDeck()` takes a `reporter`: where its progress, results and warnings go. The default is the console, as before; `silentReporter` from the new `@astlide/core/utils/reporter` says nothing, and your own `Reporter` can collect them. PDF and PNG exports now show their slide-by-slide progress only on a terminal, like the PPTX export, so logs don't fill with it.
