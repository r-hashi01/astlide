---
"@astlide/core": minor
---

Presenter mode shows a live preview of the next slide (or "End of deck") and how many steps — `<Fragment>` reveals and code highlight steps — remain on the current slide.

Slides rendered inside an iframe now switch to an embed mode: no toolbar/progress bar, and no keyboard, touch or presenter-sync handling. This also fixes overview (`o`) thumbnails, whose styles were never applied (they are created by script, so Astro's scoped CSS didn't match) and which could follow the presenter's navigation broadcasts.
