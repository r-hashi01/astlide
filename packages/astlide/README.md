# @astlide/core

[![CI](https://github.com/r-hashi01/astlide/actions/workflows/ci.yml/badge.svg)](https://github.com/r-hashi01/astlide/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@astlide/core.svg)](https://www.npmjs.com/package/@astlide/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Astro-based slide presentation framework — like Slidev, but for the Astro ecosystem.

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
import { glob } from "astro/loaders";
import { slideSchema } from "@astlide/core/schema";

const decks = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "src/content/decks" }),
  schema: slideSchema,
});

export const collections = { decks };
```

Author slides under `src/content/decks/<name>/01-cover.mdx`, `02-intro.mdx`, ….

For the full guide (frontmatter, themes, components, plugin API, exports) see the [project README](https://github.com/r-hashi01/astlide#readme).

To scaffold a fresh project, use [`create-astlide`](https://www.npmjs.com/package/create-astlide):

```bash
bun create astlide my-slides
```

## License

MIT
