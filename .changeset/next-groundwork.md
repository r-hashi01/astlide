---
"@astlide/core": minor
---

More groundwork for React / Next.js (experimental):

- `renderDeck` renders MDX slides with a `renderMdx` (`renderMdxToHtml` from `@astlide/react`) and takes the site's `publicDir` for root-relative pictures; the print view gets the components' and KaTeX's styles.
- The print view's styles are `@astlide/core/styles/print.css`, written so slides may sit in a framework's wrappers (`/<deck>/all` looks the same).
- `mountDeck(config, { placeSlide: false })` leaves the presenter window's slide where the host rendered it.
