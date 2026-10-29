---
title: Getting Started
description: Create a new Astlide project or add Astlide to an existing Astro site.
---

Astlide is an [Astro](https://astro.build) integration. You need **Astro 7.2.10 or later** and Node.js 22.12 or later. The commands on this page use [Bun](https://bun.sh); npm, pnpm and Yarn work as well.

## Create a new project

```bash
bun create astlide my-slides
cd my-slides
bun install
bun run dev
```

`bun create astlide` asks three questions: a theme, whether to include the example slides, and which package manager you use. Press Enter to accept the defaults. It doesn't install any packages, so run `bun install` next.

Once the dev server is running, open `http://localhost:4321`. The deck index lists one deck, `example-deck`. Click it to open its first slide.

## Add to an existing Astro project

Install the package:

```bash
bun add @astlide/astro
```

Add the integration to your Astro config:

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import astlide from "@astlide/astro";

export default defineConfig({
  integrations: [astlide()],
});
```

Then define a content collection named `decks` with Astlide's loader and schema:

```ts
// src/content.config.ts
import { defineCollection } from "astro:content";
import { astlideDeckLoader, slideSchema } from "@astlide/astro";

const decks = defineCollection({
  // Renders .mdx, .md, and .html slides from src/content/decks/<deck>/
  loader: astlideDeckLoader(),
  schema: slideSchema,
});

export const collections = { decks };
```

:::caution
Use `astlideDeckLoader()` here. A `glob({ pattern: "**/*.mdx" })` loader finds only `.mdx` files. `astlideDeckLoader()` also reads `.md`, `.html` and `.pptx` slides and sorts all of them by the number in the file name.
:::

If your site already has a home page (`src/pages/index.astro`, `.md`, `.mdx` or `.html`), Astlide leaves `/` to it and doesn't add the deck index there. Your decks still work at `/<deck>/1`.

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

Each folder under `src/content/decks/` is one deck, and its name is part of the URL: slide 2 of `my-talk` is at `/my-talk/2`. The number at the start of each file name sets the slide order. `_config.json` holds the deck's title, author, date and theme. The deck index at `/` lists every deck.

## Next steps

- Work through the [tutorial](/tutorial/first-deck/): write a short talk, present it, export a PDF and publish it.
- Read [Creating a Deck](/guides/decks/) to see what you can put on a slide.
- Learn the keys and the presenter window in [Presenting](/guides/presenting/).
- Browse every layout and theme in the [Gallery](/gallery/), or open the [live demo](https://astlide.dev/demo/tour/1/).
