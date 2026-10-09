---
title: Getting Started
description: Create a new Astlide project or add Astlide to an existing Astro site.
---

Astlide is an [Astro](https://astro.build) integration. It needs **Astro 7.2.10 or later** and is developed with [Bun](https://bun.sh).

## Create a new project

```bash
bun create astlide my-slides
cd my-slides
bun install
bun run dev
```

Open the dev server URL — you'll see the deck index; pick a deck to start presenting.

## Add to an existing Astro project

```bash
bun add @astlide/core
```

Register the integration:

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import astlide from "@astlide/core";

export default defineConfig({
  integrations: [astlide()],
});
```

Define the `decks` content collection with Astlide's loader and schema:

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

:::caution
Use `astlideDeckLoader()` rather than `glob({ pattern: "**/*.mdx" })` — it also handles `.md` and `.html` slides and keeps them in numeric order.
:::

## Project structure

```
src/
├── content.config.ts
└── content/
    └── decks/
        └── my-talk/
            ├── _config.json      # title, author, date, theme
            ├── 01-cover.mdx
            ├── 02-intro.md
            └── 03-demo.html
```

Every directory under `src/content/decks/` is a deck, served at `/<deck>/<slide-number>`. The deck index lives at `/`.

## Next steps

- [Create your first deck](/astlide/guides/decks/)
- [Present it](/astlide/guides/presenting/) — keyboard shortcuts, presenter window, pen and laser
- [Try the live demo](https://r-hashi01.github.io/astlide/demo/)
