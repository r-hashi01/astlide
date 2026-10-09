---
title: Diagrams
description: Mermaid diagrams from ```mermaid code fences.
---

Write [Mermaid](https://mermaid.js.org/) diagrams in a `mermaid` code fence. Rendering uses the optional `mermaid` package — install it to enable diagrams:

```bash
bun add mermaid
```

````md
```mermaid
flowchart LR
  Write --> Present --> Export
```
````

- **Loaded on demand** — only slides that contain a diagram fetch `mermaid`; projects without it build normally.
- **Theme** follows the deck: `dark` / `gradient` → Mermaid `dark`, `forest` → `forest`, everything else → `default`.
- **Sized for slides** — labels are scaled to match the slide's body text.
- Works in `.mdx` and `.md` slides, the presenter preview, and PDF export (exporters wait for diagrams to finish rendering).
- Without `mermaid` installed — or when a diagram has a syntax error — the source is shown as code and a message is logged to the browser console.
