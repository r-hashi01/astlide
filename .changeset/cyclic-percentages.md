---
"@astlide/core": patch
---

`check_deck` and PowerPoint export size boxes more like browsers do:

- A percentage width or height inside a box sized by its content (a badge holding an icon at `width: 60%`, a `width: 100%` title in a centered column) is treated as `auto` while sizing that box, then resolved against it.
- A box that shrinks to fit wrapping text is as wide as the room it has, not as its widest line.
- An `aspect-ratio` box shrinks in a row like other flex items, and `aspect-ratio` doesn't apply once both width and height are set.
