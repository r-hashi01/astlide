---
"@astlide/core": patch
"@astlide/react": patch
"@astlide/vue": patch
---

Accessibility: the slide overview and the go-to dialog keep keyboard focus and screen readers inside while open (the page behind is inert), and closing returns focus where it was. The overview opens with the current slide focused. The speaker notes' close button is a `type="button"`.
