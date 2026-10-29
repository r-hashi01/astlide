---
"@astlide/core": major
"@astlide/astro": major
---

**Breaking:** the Astro integration moves out of `@astlide/core` into the new `@astlide/astro`. `@astlide/core` is now the framework-agnostic core: deck reader, rendering and exports, deck runtime, styles, PowerPoint, template stores, the `astlide` CLI and the MCP server. The React, Next.js, Vue and Nuxt packages build on it too.

To migrate an Astro project:

1. Install `@astlide/astro` in place of `@astlide/core`. It installs the core and the `astlide` command.
2. In `astro.config.mjs`, change `import astlide from "@astlide/core"` to `import astlide from "@astlide/astro"`.
3. In `src/content.config.ts`, import `astlideDeckLoader` and `slideSchema` from `@astlide/astro`, and `@astlide/core/loader` becomes `@astlide/astro/loader`.
4. Component imports change from `@astlide/core/components/*.astro` to `@astlide/astro/components/*.astro`.

These stay in `@astlide/core`: `@astlide/core/schema`, `/plugin`, `/context`, `/styles/*`, `/deck`, `/render`, `/runtime`, `/pptx`, `/templates`, `/embed` and `/mcp`. Plugins keep importing `defineAstlidePlugin` from `@astlide/core/plugin`. The `@astlide/core` entry point no longer has the integration or `astlideDeckLoader`. It keeps the schemas, the plugin API and the deck metadata functions.
