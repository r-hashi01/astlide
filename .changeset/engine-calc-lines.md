---
"@astlide/core": patch
---

`check_deck` and PowerPoint export lay out more like browsers do:

- `calc()` with `*`, `/`, parentheses and nested `calc()` (as in Tailwind / UnoCSS spacing utilities such as `space-y-*`) resolves; units `vmin`, `vmax`, `in`, `cm`, `mm`, `ch` and `ex` are recognised.
- A line breaks before an inline element that doesn't fit after a space (`<code>` with padding), and kerning between the pieces of a line counts.
- Closing punctuation at the end of a line goes half-width when that makes it fit, as in Chromium.
