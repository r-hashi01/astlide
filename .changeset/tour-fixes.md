---
"@astlide/core": minor
---

- `<ImageSide src>` and image `background`s with a root-relative path (`/photo.jpg`) now resolve against Astro's `base`, so decks with images work under a sub-path. New helper `withBaseIfRootRelative` in `@astlide/core/utils/base-path`.
- `two-column` layout: a title (or anything other than `<Left>` / `<Right>`) now spans the full width above the columns instead of becoming a third column.
- `class: text-light` / `text-dark` now also recolor headings (they previously kept the theme's heading color, e.g. dark titles on `image-full` backgrounds).
