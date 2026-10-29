---
"@astlide/core": minor
---

The slide components' styles (Columns, Left / Right, ImageSide, TextPanel, Fragment, SpeakerNotes, CodeBlock, Math, YouTube, Tweet) are now one stylesheet, `@astlide/core/styles/components.css`, for every framework. Each component's root element carries `data-astlide-c` and every rule goes through it, so — as with Astro's scoped styles before — they never reach an element of yours that uses the same class name. Slides look the same.
