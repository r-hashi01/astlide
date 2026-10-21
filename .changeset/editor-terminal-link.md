---
"@astlide/core": minor
---

The dev slide editor needs a browser enabled through a link `astro dev` prints at startup: a one-time code (works once, for 30 minutes) that sets a cookie for this project and port, derived from a secret kept in `node_modules/.astro/` (delete it to reset). Without it the editor shows how to turn editing on and saves nothing — even for requests relayed to the dev server over a raw port forward. The editor only edits slide files that already exist in `src/content/decks/`.

Scripts in Markdown, HTML and PowerPoint slides — `<script>`, inline event handlers, `javascript:` URLs — are now removed when the slide is rendered, in `astro dev` and in builds: slide content can come from others. MDX slides keep theirs. The new `slideScripts: true` option keeps them for decks you fully trust.
