# @astlide/core

[![CI](https://github.com/r-hashi01/astlide/actions/workflows/ci.yml/badge.svg)](https://github.com/r-hashi01/astlide/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@astlide/core.svg)](https://www.npmjs.com/package/@astlide/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The core of [Astlide](https://astlide.dev/), with no framework in it. It holds what every Astlide package shares, so a deck of MDX, Markdown, HTML and PowerPoint slides looks and behaves the same wherever it runs.

**Building a site?** Install the package for your framework. Each one depends on this core:

| Framework | Package |
| --- | --- |
| Astro | [`@astlide/astro`](https://www.npmjs.com/package/@astlide/astro) |
| React | `@astlide/react` |
| Next.js | `@astlide/next` |
| Vue | `@astlide/vue` |
| Nuxt | `@astlide/nuxt` |

## What's in it

- **`@astlide/core/deck`** reads a deck folder: `_config.json`, then numbered `.mdx`, `.md`, `.html` and `.pptx` slides. MDX compiles for any JSX runtime with the same pipeline Astro uses.
- **`@astlide/core/render`** renders a deck to HTML, PDF, PNG or PPTX without building a site.
- **`@astlide/core/runtime`** is the deck runtime that every framework drives: navigation, fragments, the presenter window, overview, drawing, notes. It comes with the chrome markup and the stylesheets in `@astlide/core/styles/*`.
- **`@astlide/core/pptx`** and **`@astlide/core/templates`** cover PowerPoint import and PowerPoint templates as themes, kept in a folder, S3, GCS or Azure.
- **`@astlide/core/schema`** has the frontmatter and `_config.json` schemas. **`@astlide/core/plugin`** has the plugin API.
- **The `astlide` CLI** exports, imports and renders decks, and runs the MCP server for coding agents.

📖 Docs: https://astlide.dev/ (日本語: https://astlide.dev/ja/)

## Coming from Astlide 2

The Astro integration that used to be `@astlide/core` is now [`@astlide/astro`](https://www.npmjs.com/package/@astlide/astro). Install it in place of `@astlide/core`, then import `astlide`, `astlideDeckLoader` and `slideSchema` from `@astlide/astro`. Component paths move too: `@astlide/core/components/*` becomes `@astlide/astro/components/*`.

## License

MIT
