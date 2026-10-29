---
"@astlide/core": minor
---

Groundwork for React, Next.js and Vue (experimental):

- `compileSlideMdx` / `evaluateSlideMdx` (`@astlide/core/deck`): MDX slides compiled with Astro's own MDX engine and Astlide's Shiki transformers for any JSX runtime (`react`, `vue` …), so the same `.mdx` slides render the same outside Astro. `readDeck` now reads an MDX slide's trailing comment as its notes, and `renderNotesHtml` renders notes for the presenter.
- The deck runtime exports `applyPageFlags`, and keeps a slide the host already placed in the presenter panel; `backgroundDeclarations` gives a slide's background as declarations.
- Diagrams render through `renderDiagramsWith(loadMermaid)` outside Astro; `base-path` works where `import.meta.env` doesn't exist.
