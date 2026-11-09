---
"@astlide/core": patch
---

Layout engine (`check_deck` and the PowerPoint export): CSS nesting is applied in its parent's context instead of leaking into the parent rule (`.a{&:hover{…}}`, nested `@media`); cascade layers (`@layer`, used by Tailwind v4) rank as in browsers; `[id=x]` has attribute specificity; inline styles with `;` inside `url(…)` or `! important` are read correctly; keywords are read in any case (`display: FLEX`).
