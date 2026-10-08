---
"@astlide/core": minor
---

Render Mermaid diagrams from ```mermaid code fences. `mermaid` is an optional dependency (`bun add mermaid`) loaded only on slides that contain a diagram. Diagrams follow the deck theme, scale labels to the slide's text size, and are awaited by the PDF exporters. Without `mermaid` — or on a syntax error — the source is shown as code.
