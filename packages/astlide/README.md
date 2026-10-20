# @astlide/core

[![CI](https://github.com/r-hashi01/astlide/actions/workflows/ci.yml/badge.svg)](https://github.com/r-hashi01/astlide/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@astlide/core.svg)](https://www.npmjs.com/package/@astlide/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Slides that live in your Astro site.** An Astro integration for presentations: write slides in MDX, Markdown or HTML, present them on the web, and hand them over as editable PowerPoint in your company's template.

- **Many decks, one site** — every folder under `src/content/decks/` is a deck, sharing themes, components and one deploy.
- **Your PowerPoint template, editable PPTX out** — register a `.pptx` / `.potx` template as a theme; `astlide export --pptx` writes real text boxes, tables and shapes with speaker notes, without a browser.
- **PowerPoint & Google Slides in** — drop a `.pptx` into a deck, or `astlide import` it into editable slides.
- **Goes into any Astro site** — React / Vue / Svelte components in slides, `<astlide-deck>` to embed decks elsewhere.
- **For coding agents** — `astlide mcp` runs an MCP server: read templates, import, check for text that doesn't fit, export.

📖 Docs: https://astlide.dev/ (日本語: https://astlide.dev/ja/)

## Install

```bash
bun add @astlide/core
# or: npm install @astlide/core
```

## Use

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import astlide from "@astlide/core";

export default defineConfig({
  integrations: [astlide()],
});
```

```ts
// src/content.config.ts
import { defineCollection } from "astro:content";
import { astlideDeckLoader, slideSchema } from "@astlide/core";

const decks = defineCollection({
  // Renders .mdx, .md, and .html slides from src/content/decks/<deck>/
  loader: astlideDeckLoader(),
  schema: slideSchema,
});

export const collections = { decks };
```

Author slides under `src/content/decks/<name>/` as numbered `.mdx`, `.md`, or `.html`
files (`01-cover.mdx`, `02-intro.md`, `03-demo.html`, …).

For the full guide (frontmatter, layouts, themes, PowerPoint templates, export, import, presenting, agents) see the [documentation](https://astlide.dev/).

To scaffold a fresh project, use [`create-astlide`](https://www.npmjs.com/package/create-astlide):

```bash
bun create astlide my-slides
```

## License

MIT
