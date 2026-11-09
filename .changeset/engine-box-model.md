---
"@astlide/core": patch
---

`check_deck` and PowerPoint export size images like browsers do: `min-` / `max-width` and `-height` keep an image's proportions, and an image in a flex row stays within its `max-width` (`max-w-full`) instead of keeping its natural width.
