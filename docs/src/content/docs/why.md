---
title: Why Astlide?
description: What Astlide is good at, how it compares to Slidev, Marp, reveal.js and Quarto, and when to choose something else.
---

Astlide is for people who want slides to be part of a website — and who still have to hand over PowerPoint.

## What makes it different

**Decks are content, not projects.** Most slide tools build one deck per project. In Astlide every folder under `src/content/decks/` is a deck of an Astro content collection, and the site serves an index of them. A year of talks, a team's weekly reports, a product's training decks: one repository, one set of themes and components, one deploy.

**It's an SDK, not an app.** Astlide is `astlide()` in your `astro.config.mjs`, so it goes into whatever site you build — a blog, Starlight docs, a portal with your own navigation. Its pieces work on their own too: the deck loader (`astlideDeckLoader`), PowerPoint import and templates (`@astlide/core/pptx`), and the layout engine behind the PPTX export (`@astlide/engine`).

**Your PowerPoint template, editable PowerPoint out.** Register a `.pptx` / `.potx` / `.thmx` [template as a theme](/astlide/guides/templates/) and Markdown slides take its backgrounds, fonts, colors and placeholder positions. [Export](/astlide/guides/export/) writes real PowerPoint text boxes, tables and shapes with your speaker notes, laid out by Astlide's own engine — no browser or LibreOffice involved, so it runs anywhere Node runs.

**PowerPoint and Google Slides in.** A `.pptx` dropped into a deck folder shows as slides; `astlide import` turns one into editable HTML slides ([Import](/astlide/guides/import/)). Moving an existing deck into the site — or updating last quarter's — doesn't start from scratch.

**Any framework's components.** Slides are Astro, so React, Vue, Svelte, Solid and Preact components work on them, interactive while you present ([guide](/astlide/guides/frameworks/)).

**Every slide is a static page.** Each slide is its own URL and HTML file (`/my-talk/7`): link to a single slide, load without a client app booting, host anywhere — including sub-paths such as GitHub Pages.

**HTML is a first-class slide format.** Alongside `.mdx` and `.md`, a slide can be a plain `.html` file rendered verbatim — hand-made layouts, or HTML written by an AI assistant.

## How it compares

| | Astlide | Slidev | Marp | reveal.js | Quarto |
|---|---|---|---|---|---|
| Built on | Astro (integration) | Vite + Vue (app) | Markdown converter | JavaScript library | Pandoc |
| Decks per project | Many (content collection) | One | One per file | One per page | One per file |
| Embed in an existing site | Yes (any Astro site) | Separate build | Separate output | Library | Separate output |
| Components | React, Vue, Svelte, Solid, Preact, Astro | Vue | — | — | — |
| Editable PPTX | Yes, without a browser | Yes, measured in a browser | Experimental (browser + LibreOffice) | No | Yes (Pandoc) |
| Company `.potx` template | Template as theme, any layout | — | — | — | Reference doc, fixed layouts |
| PPTX / Google Slides import | Yes | — | — | — | — |
| Presenter mode, pen, overview | ✓ | ✓ | Limited | ✓ (plugins) | ✓ (reveal.js) |
| Ecosystem & maturity | Young | Large, mature | Mature | Very mature | Mature |

*Summaries as of October 2026 — check each project's docs for current details.*

## When to choose something else

- **You want the biggest ecosystem of themes and add-ons** → [Slidev](https://sli.dev) is more mature and has far more community themes.
- **You want a single Markdown file and nothing else** → [Marp](https://marp.app) is simpler.
- **Your slides come out of notebooks or R / Python analysis** → [Quarto](https://quarto.org) fits that workflow.
- **You don't use Astro and don't want a build step** → reveal.js or Marp will be lighter.
- **You need to edit slides visually** → a GUI tool (Keynote, PowerPoint, Google Slides) fits better. Astlide is code-first.

## Where Astlide is still young

Astlide is new. Its theme and plugin ecosystem is small, and some features other tools have are still on the [roadmap](https://github.com/r-hashi01/astlide/issues) — contributions are welcome.
