---
"@astlide/core": minor
---

**Speaker notes are no longer published by default.** The `notes` option now defaults to `"dev"`: notes are included while running `astro dev`, but not in pages built with `astro build` — a deployed deck's presenter window says its notes aren't published. To present from the deployed site with notes, set `notes: "public"` (anyone who can open the deck can then read them, as before).

`astlide export` now builds into its own folder, `node_modules/.astro/astlide-export`, instead of `dist/`. That build always includes speaker notes, so PowerPoint exports keep them, and the `dist/` you deploy is never changed by an export. `--no-build` reuses the last export build (else `dist/`).

Notes written as a trailing `<!-- … -->` comment are now also taken out of the rendered `.md` and `.html` slides (they were left in the page's HTML as a comment). `ASTLIDE_EXPORT_BUILD` only counts when it names the project's own export folder, and builds never inherit it.
