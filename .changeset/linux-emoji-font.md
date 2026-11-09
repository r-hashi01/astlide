---
"@astlide/core": patch
---

The layout engine (`check_deck` and the PowerPoint export) measures emoji with the system's Noto Color Emoji on Linux, as it does with Apple Color Emoji on macOS, so lines with emoji break where the browser breaks them (also in the `@astlide/server` Docker image).
