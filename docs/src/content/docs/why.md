---
title: Why Astlide?
description: Who Astlide is for, what it does that Slidev, Marp, reveal.js and Quarto don't, and when one of those is the better choice.
---

Astlide suits you if you write slides as code, want them published on a website, and still get asked for PowerPoint files. It is an Astro integration, so it also assumes you are happy to use Astro.

## What Astlide does differently

### One site holds all your decks

Most slide tools give you one deck per project. In Astlide, each folder under `src/content/decks/` is a deck, loaded as an Astro content collection, and the site lists them all on an index page. You can keep a year of talks, your team's weekly reports or a product's training material in one repository, share themes and components between them, and publish them in one deploy.

### It runs inside your Astro site

You add Astlide with `astlide()` in `astro.config.mjs`. The site around it can be a blog, a Starlight docs site or a portal with its own navigation, and the decks sit next to its other pages.

Some parts also work on their own: the deck loader (`astlideDeckLoader`), PowerPoint import and templates (`@astlide/core/pptx`), and the layout engine behind the PPTX export (`@astlide/core/engine`).

### PowerPoint templates in, editable PowerPoint out

You can register a `.pptx`, `.potx` or `.thmx` file [as a theme](/guides/templates/). Slides you write in Markdown then use the template's backgrounds, fonts, colors and placeholder positions.

The [PPTX export](/guides/export/) writes text boxes, tables and shapes you can edit in PowerPoint, and puts your speaker notes in the notes pane. Astlide lays out the slides with its own engine, so the export needs neither a browser nor LibreOffice and runs anywhere Node runs.

### Existing PowerPoint and Google Slides decks come along

Put a `.pptx` file in a deck folder and Astlide shows its slides. Run `astlide import` to turn one into HTML slides you can edit ([Import](/guides/import/)). Moving an old deck onto the site, or updating last quarter's, doesn't mean rebuilding it by hand.

### Components from any framework

Astro renders the slides, so you can use React, Vue, Svelte, Solid and Preact components on them. They stay interactive while you present. See [React, Vue & Svelte components](/guides/frameworks/).

### Every slide is a static page

Each slide has its own URL and HTML file, such as `/my-talk/7`. You can link to a single slide, the page shows without waiting for a client-side app to start, and any static host works, including a sub-path such as GitHub Pages.

### Slides can be plain HTML

Besides `.mdx` and `.md`, a slide can be an `.html` file. Astlide renders it as written, which is handy for layouts you build by hand or HTML an AI assistant generates.

## Comparison

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

*As of October 2026. Check each project's docs for current details.*

## When another tool fits better

- If you want many ready-made themes and add-ons, use [Slidev](https://sli.dev). It is more mature and has far more community themes.
- If one Markdown file per deck is all you need, [Marp](https://marp.app) is simpler.
- If your slides come from notebooks or R / Python analysis, [Quarto](https://quarto.org) fits that workflow.
- If you don't use Astro and don't want a build step, reveal.js or Marp is lighter.
- If you want to arrange slides visually with a mouse, use Keynote, PowerPoint or Google Slides. Astlide is for writing slides as code.

## Where Astlide is still young

Astlide is a new project. There are few themes and plugins so far, and some features other tools have are still on the [roadmap](https://github.com/r-hashi01/astlide/issues). Contributions are welcome.
