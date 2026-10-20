---
name: astlide
description: Write, check and export slide decks with Astlide (Astro-based slides in Markdown, MDX or HTML). Use when the user asks for a presentation, slides or a deck in an Astlide / Astro project, wants slides in a PowerPoint template's design, wants to convert a .pptx into editable slides, or wants a deck exported to PowerPoint (.pptx) or PDF.
---

# Astlide

Astlide is an Astro integration: each deck is a folder of numbered slide files in an Astro project, every slide is a static page at `/<deck>/<n>`, and decks export to PDF, PNG and editable PowerPoint. Docs: https://astlide.dev/ (agent-readable: https://astlide.dev/llms-full.txt).

## When to use

- The user wants slides / a talk / a deck and the project has `@astlide/core` (or they want a new slides project).
- The user has a PowerPoint or Google Slides template and wants Markdown slides in its design.
- The user has a `.pptx` to edit as text, or wants a deck as `.pptx` / `.pdf`.

## Tools (MCP server `astlide`, if connected)

| Tool | Use it to |
|---|---|
| `template_layouts` `{templatePath}` | List a template's layouts: the `slideLayout` ids to write, title / body placeholders, which built-in layouts map to them |
| `import_pptx` `{path, projectRoot?, deck?}` | Read a .pptx as Markdown (titles, notes, text); with `projectRoot`, write it as an editable deck |
| `check_deck` `{projectRoot, deck}` | Find text and boxes that overflow or are cut off, per slide, in px |
| `render_deck` `{projectRoot, deck, formats}` | Export to `pptx` and / or `pdf`; returns the file paths |

Without the MCP server, use the CLI: `bunx astlide export <deck> --pptx --pdf`, `bunx astlide import file.pptx --deck <name>`.

## Workflow

1. **Set up** (only if there is no project): `bun create astlide my-slides && cd my-slides && bun install`. In an existing Astro site: `bun add @astlide/core`, add `astlide()` to `integrations` in `astro.config.mjs`, and define the `decks` collection (see [references/setup.md](references/setup.md)).
2. **Plan the deck**: one idea per slide; a title plus 3–6 short bullets is a full slide. If the user gave a template, call `template_layouts` first and use its layout ids.
3. **Write** `src/content/decks/<deck>/_config.json` and the numbered slide files.
4. **Check**: call `check_deck`. For every issue, shorten the text, split the slide into two, or switch to a roomier layout. Repeat until it reports that all slides fit.
5. **Export**: call `render_deck` with the formats the user asked for and give them the paths.

Don't start `astro dev` just to check a deck — `check_deck` and `render_deck` build the site themselves.

## Deck structure

```
src/content/decks/q3-review/
├── _config.json          { "title": "Q3 review", "author": "Ana", "date": "2026-10-01", "theme": "default" }
├── 01-cover.md
├── 02-agenda.md
├── 03-results.mdx
└── 04-demo.html
```

- Files sort by name; number them `01-`, `02-` … (renumber to insert, or use `02b-`).
- `.md` (Markdown), `.mdx` (Markdown + components, no imports needed) and `.html` (rendered verbatim, inline `<style>` allowed) can be mixed.
- `_config.json`: `title`, `author`, `date`, `theme` — themes: `default`, `dark`, `minimal`, `corporate`, `gradient`, `rose`, `forest`, or a template theme registered in `astro.config.mjs`.

## Slide frontmatter

```yaml
---
slideLayout: default      # NOT `layout` — Astro reserves it
transition: fade          # none | fade | slide-left | slide-right | slide-up | zoom
title: "Agenda"           # optional; defaults to the first heading
background: "#1e293b"     # CSS color, gradient or url(…)
class: "text-light"       # extra classes on the slide
notes: "Speaker notes"    # or a trailing <!-- … --> comment, or <SpeakerNotes>
hidden: false             # true: skipped in production builds
---
```

## Layouts (`slideLayout`)

| Layout | For | Body |
|---|---|---|
| `cover` | opening / closing slide | `# Title` + a line or two |
| `section` | chapter divider | `# Section name` |
| `default` | standard content | `# Title` + bullets, table, image |
| `two-column` | comparisons | `# Title`, then `<Left>…</Left>` `<Right>…</Right>` (MDX) |
| `image-left` / `image-right` | picture + text | `<ImageSide src alt />` + `<TextPanel>…</TextPanel>` (MDX) |
| `image-full` | full-bleed picture | `background: "/img.jpg"` and `class: text-light` + a short title |
| `code` | a code listing | one fenced code block |
| `quote` | a quotation | `> quote` + attribution |
| `statement` | one big sentence | `# One idea per slide.` |

Examples and components (`<Columns>`, `<Fragment>`, `<Fragments>`, `<CodeBlock>`, `<Math>`, `<SpeakerNotes>`, `<YouTube>`, `<Tweet>`): [references/components.md](references/components.md).

## PowerPoint templates

```js
// astro.config.mjs
astlide({ templates: { brand: "./templates/brand.pptx" } })   // .pptx, .potx or .thmx
```

Then `"theme": "brand"` in `_config.json`. In each slide the **first heading goes into the layout's title placeholder** and the rest into its body placeholder. `cover`, `section`, `default`, `two-column` and `code` use the template's matching layouts; every template layout is also available by its id from `template_layouts` (e.g. `slideLayout: comparison`). In a two-content layout, `<Left>` / `<Right>` fill the two placeholders. Placeholders are fixed boxes, so long text overflows them — `check_deck` finds it.

## Import a PowerPoint

- Show a .pptx as it is: drop it in a deck folder (`02-numbers.pptx`); its pages become slides in place.
- Make it editable: `import_pptx` with `projectRoot` (or `bunx astlide import talk.pptx --deck talk`) writes one `.html` slide per page — absolutely positioned shapes, one per line. Edit the text in place; for a redesign, read the Markdown that `import_pptx` returns and write new `.md` slides instead.

## Export

- `render_deck` → `exports/<deck>.pptx` (editable text boxes and shapes, no browser needed) and `exports/<deck>.pdf` (needs `bunx playwright install chromium` once).
- CLI: `bunx astlide export <deck> --pptx --pdf [--out-dir dir]`.
- Exports show every slide in its final state (all fragments revealed).

## Fixing `check_deck` issues

Each issue names the slide number and title, the text, what it overflows and by how many px on which side:

```
Slide 4 "Results": 3 text blocks, "Churn fell to 2%" to "Next: EMEA", are cut off by the slide (120px bottom)
Slide 6 "Pricing": text "Enterprise plans include…" (p) overflows div.card (48px bottom)
```

- `bottom` overflow on a list or paragraph: cut words, drop a bullet, or move half to a new slide (renumber files).
- `right` overflow: a long word, URL or code line — break it, shorten it, or use a smaller code block.
- Overflowing a template placeholder: shorter title (titles should fit on one line) or a layout with a larger body.
- A picture cut off: give it a smaller `width` / `height`, or use `image-left` / `image-right` / `image-full`.
- Results are measured with the theme's fonts; when a font can't be found the note says so and sizes are approximate.

## Gotchas

- Use `slideLayout`, never `layout`, in frontmatter.
- `.md` slides can't use components; use `.mdx` for `<Left>`, `<Fragment>` etc. In `.mdx`, keep blank lines around Markdown inside components, and write comments as `{/* … */}` (a trailing `<!-- … -->` is still read as notes).
- Slides are 1920×1080; body text is large, so ~6 bullets of one line each is the practical maximum.
- Content collection: `astlideDeckLoader()` (not `glob(...)`) with `slideSchema`.
- Images go in `public/`. Root-relative paths in `<ImageSide src>` and `background` get Astro's `base` added; Markdown `![](/img.png)` and raw `<img>` don't — prefer `<ImageSide>` / `background` when the site has a `base`.
- Bun is the package manager (`bun add`, `bunx`); Astro needs Node ≥ 22.12 as well.
