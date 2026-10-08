---
"@astlide/core": minor
---

Add line highlighting for code fences. `{2,4-6}` after the language highlights those lines and dims the rest; `{1|3-5|all}` steps through the ranges on → / Space, sharing one sequence with `<Fragment>` reveals. Works in `.mdx` and `.md` slides. The Shiki transformer is also exported as `astlideCodeHighlight` from `@astlide/core/utils/code-highlight`.

Also fixes the print view (`/[deck]/all`, used for PDF export) rendering `<Fragment>` content invisible — fragments and code steps now appear in their final state.
