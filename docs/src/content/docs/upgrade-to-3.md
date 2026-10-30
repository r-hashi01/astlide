---
title: Upgrading to Astlide 3
description: What changes for an Astro project in Astlide 3, and the steps to upgrade. Your decks don't change.
---

An Astro project upgrades to Astlide 3 by changing a package name and some imports, because the Astro integration is now `@astlide/astro` instead of `@astlide/core`. Your decks don't change: slides, frontmatter, `_config.json`, themes, layouts and components work as they are.

## Upgrade an Astro project

1. Swap the package. `@astlide/astro` installs `@astlide/core` and the `astlide` command with it:

   ```bash
   bun remove @astlide/core
   bun add @astlide/astro
   ```

2. Import the integration from `@astlide/astro`:

   ```js
   // astro.config.mjs
   import astlide from "@astlide/astro"; // was "@astlide/core"
   ```

3. Import the loader and schema from `@astlide/astro` as well:

   ```ts
   // src/content.config.ts
   import { astlideDeckLoader, slideSchema } from "@astlide/astro"; // was "@astlide/core"
   ```

4. If you import Astlide's components or other entry points directly, change the paths in this table:

   | Astlide 2 | Astlide 3 |
   |---|---|
   | `@astlide/core` (the integration, `astlideDeckLoader`) | `@astlide/astro` |
   | `@astlide/core/loader` | `@astlide/astro/loader` |
   | `@astlide/core/components/*.astro` | `@astlide/astro/components/*.astro` |
   | `@astlide/core/internal/diagrams` | `@astlide/core/runtime/diagrams` |
   | `@astlide/core/internal/recording` | `@astlide/core/runtime/media` |
   | `@astlide/core/internal/pdf-export` | `@astlide/core/runtime/pdf-export` |
   | Imports ending in `.ts` (`@astlide/core/utils/network.ts`) | The same path without `.ts` |

   You can no longer import the other `@astlide/core/internal/*` modules, or `utils/csp`, `utils/favicon`, `utils/pptx-templates` and `utils/slide-mark`. These were undocumented internal modules. If you use one, tell us what for in an [issue](https://github.com/r-hashi01/astlide/issues).

These stay where they were: `@astlide/core/schema`, `/plugin`, `/context`, `/embed`, `/pptx`, `/templates`, `/mcp`, `/styles/*`, and the documented helpers `utils/base-path`, `utils/code-highlight` and `utils/mermaid`. `@astlide/core` itself still exports the schemas, `defineAstlidePlugin` and `getDeckContext` / `getClientDeckContext`.

## Plugins

Plugins keep importing `defineAstlidePlugin` from `@astlide/core/plugin`. Change a plugin's peer dependency to `@astlide/core` 3, or to `@astlide/astro` 3 if its layouts are `.astro` components.

## What you can do with 3

- **Use the same decks in [Next.js](/frameworks/next/), [Nuxt](/frameworks/nuxt/), [React](/frameworks/react/) and [Vue](/frameworks/vue/),** MDX included, with the presenter window and exports.
- **Run `astlide export --base-url` outside an Astro project,** to export PDF, PNG and PPTX from any running Astlide site.
- **Put decks into a framework that has no package yet** with `@astlide/core/deck`, `/deck/pages`, `/deck/print-view`, `/render` and `/runtime`, the parts the framework packages are built from.
