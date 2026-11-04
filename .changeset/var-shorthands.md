---
"@astlide/core": patch
---

`check_deck` and PowerPoint export read shorthands whose value comes from a custom property, such as `padding: var(--slide-padding)` with `--slide-padding: 2rem 4rem`, as browsers do. Before, each side got the whole value and counted as 0, so a theme's slide padding was lost and everything on the slide moved.
