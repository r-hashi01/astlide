# Project setup

Astlide needs Astro 7.2.10 or later; it is developed with Bun (Node ≥ 22.12 is also needed by Astro).

## New project

```bash
bun create astlide my-slides
cd my-slides
bun install
```

Add a deck with `bunx create-astlide deck my-talk --theme dark --format md` (or `mdx` / `html`), or by hand.

## Existing Astro site

```bash
bun add @astlide/core
```

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import astlide from "@astlide/core";

export default defineConfig({
  integrations: [
    astlide({
      // optional: PowerPoint templates as themes
      templates: { brand: "./templates/brand.pptx" },
    }),
  ],
});
```

```ts
// src/content.config.ts
import { defineCollection } from "astro:content";
import { astlideDeckLoader, slideSchema } from "@astlide/core";

const decks = defineCollection({ loader: astlideDeckLoader(), schema: slideSchema });

export const collections = { decks };
```

## Exporting

- PPTX needs nothing else.
- PDF / PNG need Playwright's Chromium once: `bunx playwright install chromium`.
- Mermaid diagrams need `bun add mermaid`.

## MCP server

The `astlide` MCP server ships with `@astlide/core` (`astlide mcp`, runs with Bun). In the project folder:

```bash
claude mcp add astlide -- bunx astlide mcp
```

See https://r-hashi01.github.io/astlide/guides/agents/ for Codex and Gemini CLI.
