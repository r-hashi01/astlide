---
title: Creating a Deck
description: Deck folders, _config.json, slide files in .mdx, .md and .html, and frontmatter.
---

A deck is a folder under `src/content/decks/`. Its slides are numbered files that sort by name.

## Scaffold with the CLI

```bash
bunx create-astlide deck my-talk --theme dark --format mdx   # or md | html
```

## Or create it by hand

1. Add `src/content/decks/my-talk/_config.json`:

   ```json
   {
     "title": "My Talk",
     "author": "Your Name",
     "date": "2025-01-15",
     "theme": "default"
   }
   ```

2. Add slides as numbered files. `.mdx`, `.md` and `.html` can be mixed:

   ```
   src/content/decks/my-talk/
   ├── _config.json
   ├── 01-cover.mdx
   ├── 02-intro.md
   └── 03-demo.html
   ```

The slide number in the URL (`/my-talk/2`) follows the sorted file order.

## Slide formats

- **`.mdx`** — Markdown plus components (`<Fragment>`, `<Columns>`, `<SpeakerNotes>`, …). Astlide's components are available without imports.
- **`.md`** — plain Markdown, including code highlighting and diagrams.
- **`.html`** — a self-contained HTML slide. The body is rendered verbatim (inline `<style>` and markup preserved — the same trust level as MDX), which is handy for pasting hand-crafted or AI-generated markup.

```html
---
slideLayout: cover
background: "#0b132b"
---
<style>.hero { font-size: 3rem; }</style>
<h1 class="hero">Everything in one HTML file</h1>
```

## Frontmatter

```yaml
---
slideLayout: default
transition: fade
title: "Optional — used by the go-to-slide dialog"
background: "#1e293b"
class: "text-light"
notes: "Speaker notes shown in presenter / notes mode"
hidden: false
---
```

:::caution
Use **`slideLayout`**, not `layout` — Astro's MDX pipeline reserves `layout`.
:::

See the [frontmatter reference](/astlide/reference/frontmatter/) for every field, and [layouts](/astlide/guides/layouts-and-components/) for the built-in `slideLayout` values.

## Speaker notes

Notes are hidden from the audience and show in the presenter window (`p`) and the notes overlay (`n`). Write them in whichever way suits the slide:

- **`<SpeakerNotes>`** — full Markdown, in `.mdx` slides:

  ```mdx
  # My Slide

  Content here.

  <SpeakerNotes>
  Key points to mention:
  - **First** important thing
  - Second point with `code`
  </SpeakerNotes>
  ```

- **A comment at the end of the slide** — like Slidev and Marp; works in `.md`, `.mdx` and `.html` slides, Markdown included:

  ```md
  # My Slide

  Content here.

  <!--
  Key points to mention:
  - **First** important thing
  -->
  ```

  Only a comment that *ends* the slide becomes notes — comments elsewhere stay comments. (In `.mdx`, HTML comments are otherwise not allowed; use `{/* … */}` for those.)

- **Frontmatter** — `notes: "…"` for a short line.

If a slide has more than one, `<SpeakerNotes>` wins, then frontmatter `notes`, then the trailing comment. `<Notes>` still works as an alias of `<SpeakerNotes>`.

## Editing in the browser

While `astro dev` is running, press <kbd>e</kbd> on a slide to open its source file in a panel next to it. Edit, then press <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>S</kbd> (or **Save**) — the file is written and the slide reloads. The panel stays open as you move between slides, showing each slide's source; <kbd>e</kbd> or ✕ closes it.

- Dev server only: the editor and its endpoint don't exist in production builds.
- It edits slide files (`.mdx`, `.md`, `.html` under `src/`) and nothing else; writes must come from the dev server's own page.
- Unsaved edits are flagged in the panel, and the browser warns before you reload or close the tab with unsaved changes.

## Hidden slides

`hidden: true` keeps a slide in development but skips it in production builds (requests redirect to the next visible slide).
