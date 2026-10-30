---
"@astlide/core": patch
"@astlide/astro": patch
"@astlide/react": patch
"@astlide/vue": patch
---

Accessibility: the slide overview is a list of links (screen readers announced each thumbnail as a list item, not a link). The slide area is a `<main>`, the speaker notes an `<aside>` and the presenter's notes font controls a `<fieldset>`, instead of `<div>`s with those roles. Pages look the same.
