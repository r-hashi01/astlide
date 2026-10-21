---
"@astlide/core": minor
---

**Speaker notes are no longer published by default.** The `notes` option now defaults to `"dev"`: notes are included while running `astro dev` and in the build `astlide export` makes (so PowerPoint exports keep them), but not in pages built with `astro build` — a deployed deck's presenter window says its notes aren't published. To present from the deployed site with notes, set `notes: "public"` (anyone who can open the deck can then read them, as before).
