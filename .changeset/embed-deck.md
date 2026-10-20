---
"@astlide/core": minor
---

Embed a deck in any page.

- `<astlide-deck src="/my-talk/" start="2" controls>` (`@astlide/core/embed`): a framework-agnostic custom element that shows a built deck in an iframe at 16:9, responsive to its container. Methods `next()`, `prev()`, `goTo(n)`, `requestFullscreen()`; a `slidechange` event with `{ deck, slide, total, step, steps }`; an optional control bar (previous / next, counter, fullscreen). SSR-safe to import.
- React and Vue wrappers: `@astlide/core/embed/react` and `@astlide/core/embed/vue` (`react` / `vue` are optional peer dependencies).
- `<DeckEmbed deck="my-talk" />` (`@astlide/core/components/DeckEmbed.astro`) for embedding a deck in another page of the same site, with the URL resolved against Astro's `base`.
- Deck pages framed by `<astlide-deck>` answer a small, origin-checked `postMessage` protocol, take arrow / Page / Home / End keys, and navigate without adding entries to the host page's history.
