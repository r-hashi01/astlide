---
"@astlide/core": minor
---

`@astlide/core/deck/print-view` defines what a deck's print view (`/<deck>/all`) states about itself, the same way in every framework:
- `printViewAttributes(config)` gives the `<html>` attributes.
- `printViewMeta(deck)` gives the `astlide:title`, `astlide:author` and `astlide:theme` meta tags.
- `readPrintViewMeta()` reads those tags back.

The Astro, Next.js and Nuxt print views and `renderDeck` all write them, and `astlide export --pptx --base-url` reads them. Before, each framework had its own way (`<title>`, `<meta name="author">`, a Next.js-only `astlide:theme`). The CLI's export is split into one path for an Astro project and one for a running site.
