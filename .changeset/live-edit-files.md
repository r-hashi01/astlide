---
"@astlide/core": patch
---

Dev: adding, removing or renaming slide files now updates open slides live (slide count, outline, navigation) without a full page reload. Each window stays on the slide it was showing, at the same step, even if its number changed; if that slide's file was removed, it shows the slide now at that position. Other pages reload as before.
