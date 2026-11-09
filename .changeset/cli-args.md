---
"@astlide/core": patch
"create-astlide": patch
---

Command-line fixes. `astlide export`: `--width` / `--height` take whole numbers only (`1e3`, `720px` are errors), and an option's value can't be the next option (`--base-url --pdf`). `astlide import`: failures say "Import failed", and a URL that isn't a Google Slides deck says so. `create-astlide deck`: the deck name is found after options (`deck --theme dark my-talk`), and an unknown `--theme` or `--format` is an error instead of being ignored.
