---
"@astlide/core": patch
"@astlide/astro": patch
---

Astlide's reset and element styles, and the deck page's `html, body` rules, now apply only on Astlide's pages (a deck, the print view, the deck index). In Next.js and Nuxt apps they no longer reach the app's other pages, which can scroll again. Animation keyframes are renamed with an `astlide-` prefix.

The utility classes `text-primary`, `text-secondary`, `text-accent`, `text-muted`, `bg-primary`, `bg-muted`, `text-center`, `text-left`, `text-right`, `mt-1`, `mt-2`, `mt-4`, `mb-1`, `mb-2` and `mb-4` are deprecated and will be removed in the next major version; the build warns when a slide's `class` uses one. `text-light` and `text-dark` stay.
