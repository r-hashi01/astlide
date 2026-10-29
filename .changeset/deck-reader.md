---
"@astlide/core": minor
---

Read decks without Astro: `readDeck(dir)` / `readDecks(base)` from `@astlide/core/deck` (experimental) return a deck's config and its slides in order, with validated frontmatter, title, speaker notes and, for `.md` / `.html` / `.pptx` slides, the HTML an Astlide site renders (Astro's Markdown processor with Astlide's code steps and Mermaid fences). `.mdx` slides come back as source for the host's MDX setup.
