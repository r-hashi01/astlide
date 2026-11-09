---
"@astlide/core": patch
---

`check_deck` and PowerPoint export no longer move the last word of a line to a new line when the text is a fraction of a pixel wider than a box sized to it (layout is rounded to 1/64px).
