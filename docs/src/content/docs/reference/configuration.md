---
title: Configuration
description: Every option of the astlide() integration, the fields of a deck's _config.json, and the package's entry points.
---

Astlide reads settings from two places. Options for the whole site go to `astlide()` in `astro.config.mjs`. Settings for a single deck go in that deck's `_config.json`.

## Integration options

Every option is optional. Here is the full set, each at its default:

```js
// astro.config.mjs
import astlide from "@astlide/astro";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    astlide({
      toolbar: ["prev", "counter", "next"],
      slideDecorators: [],
      plugins: [],
      templates: {},
      shikiTheme: "github-dark",
      font: undefined, // Inter + JetBrains Mono from Google Fonts
      favicon: undefined, // favicon.* from public/, if there is one
      csp: true,
      slideScripts: false,
      indexable: false,
      injectIndexRoute: undefined, // added unless you have src/pages/index.*
      drawings: { persist: false },
      notes: "dev",
    }),
  ],
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `toolbar` | `ToolbarItem[]` | `["prev", "counter", "next"]` | The buttons in the slide toolbar, in order. [Presenting](/guides/presenting/#toolbar) lists the available buttons. |
| `slideDecorators` | `string[]` | `[]` | Components to render on every slide, such as a logo or a footer. Give each one as a module path, for example `"./src/components/DeckFooter.astro"`. |
| `plugins` | `AstlidePlugin[]` | `[]` | Plugins that add themes, layouts, transitions, Shiki languages and themes, or decorators. See [Plugin API](/guides/themes-and-plugins/#plugin-api). |
| `templates` | `Record<string, string> \| string \| TemplateStore` | `{}` | PowerPoint templates to use as themes. Map a theme name to a `.pptx`, `.potx` or `.thmx` file (path relative to the project), then use that name as `theme` in `_config.json`. Or give a [template store](/guides/template-storage/) (a folder, `s3://`, `gs://` or `azure://` location, or a `TemplateStore`), and every template in it becomes a theme of its name. See [PowerPoint templates](/guides/templates/). |
| `shikiTheme` | `string` | `"github-dark"` | The Shiki theme for code blocks. |
| `font` | `false \| string \| { href?, preconnect? }` | Inter and JetBrains Mono from Google Fonts | The web font stylesheet to load. A string is the stylesheet URL; Astlide also preconnects to its origin. Use the object form to choose the preconnect origins yourself. `false` loads no font stylesheet. |
| `favicon` | `string \| false` | see description | The favicon for slide pages and the deck index. If you leave it out, Astlide uses `favicon.svg`, `favicon.ico` or `favicon.png` from `public/`. If there is none, it sets an empty icon so the browser doesn't request `/favicon.ico` from the domain root. A path starting with `/` gets Astro's `base` added. `false` outputs no favicon link. |
| `csp` | `boolean \| string` | `true` | `true` adds Astlide's Content-Security-Policy as a `<meta>` tag. A string replaces it with your own policy. `false` adds none. See [Content-Security-Policy](#content-security-policy). |
| `slideScripts` | `boolean` | `false` | Whether `<script>` tags, inline event handlers (`onclick="…"`) and `javascript:` URLs in Markdown, HTML and PowerPoint slides run. See [Scripts in slides](#scripts-in-slides). |
| `indexable` | `boolean` | `false` | Whether search engines may index the pages. While it is `false`, every page has `<meta name="robots" content="noindex, nofollow">`. |
| `injectIndexRoute` | `boolean` | see description | Whether to add the deck index at `/`. If you leave it out, Astlide adds it only when you don't have your own `src/pages/index.astro`, `.md`, `.mdx` or `.html`. `true` always adds it, `false` never does. |
| `drawings.persist` | `boolean` | `false` | Saves pen drawings in the browser's `localStorage` so they survive a reload. See [Presenting](/guides/presenting/#keeping-drawings). |
| `notes` | `"dev" \| "public"` | `"dev"` | Which pages include speaker notes. With `"dev"`, notes are in the dev server and in the build `astlide export` makes (so PowerPoint exports keep them), but not in pages built with `astro build`. With `"public"`, every page includes them, and anyone with the URL can read them. See [Speaker notes](/guides/decks/#speaker-notes). |

Astlide also follows Astro's [`base`](/guides/deploy/) option.

### Content-Security-Policy

With `csp: true`, slide pages, `/[deck]/all` and the deck index get a CSP `<meta>` tag. The policy includes `base-uri 'self'; form-action 'self'; object-src 'none'`.

In a build, `script-src` doesn't allow `'unsafe-inline'`. After `astro build`, Astlide adds a SHA-256 hash for each inline script that should run:

- the scripts Astlide and Astro put on the page
- the scripts in MDX slides and in the components they use

Inline scripts in Markdown, HTML and PowerPoint slides get no hash, so they only run with `slideScripts` on. Inline event handlers and `javascript:` URLs don't run. `style-src` keeps `'unsafe-inline'` because slides use `style` attributes.

On the dev server, `script-src` uses `'unsafe-inline'`. Astlide also adds `worker-src 'self' blob:` for Vite's client, unless your policy already sets `worker-src`.

If you pass your own policy string, Astlide uses it exactly as written.

### Scripts in slides

By default, Astlide removes `<script>` tags, inline event handlers and `javascript:` URLs from Markdown, HTML and PowerPoint slides when it renders them. That content may come from someone else, such as an imported `.pptx` or an HTML file you were sent. And on the dev server, a script in a slide would run on the same page as the slide editor.

`slideScripts: true` keeps them, on the dev server and in builds. Only turn it on for decks whose content you fully trust. If you need a script on a slide, put it in an MDX slide or a component instead: MDX slides always keep their scripts.

### Framing and headers

A `<meta>` CSP can't set `frame-ancestors`, the directive that controls which sites may show your deck in an `<iframe>`. Without it, any site can embed your deck. If your host lets you set response headers, set it there, for example `Content-Security-Policy: frame-ancestors 'self' https://your-site.example`:

- **Netlify**: in `public/_headers`, write `/*`, then `  Content-Security-Policy: frame-ancestors 'self'` on the next line.
- **Cloudflare Pages**: use the same `public/_headers` file.
- **Vercel**: in `vercel.json`, add `"headers": [{ "source": "/(.*)", "headers": [{ "key": "Content-Security-Policy", "value": "frame-ancestors 'self'" }] }]`.

GitHub Pages can't set response headers.

If other sites show your decks with [`<astlide-deck>`](/guides/embed/), add those sites to `frame-ancestors`.

## Deck `_config.json`

Put `_config.json` in the deck's folder, next to its slides. Every field is optional.

```json
{ "title": "My Talk", "author": "Alice", "date": "2025-06-01", "theme": "dark" }
```

| Field | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | the folder name | Shown on the deck index and in the browser tab. |
| `author` | `string` | none | Shown on the deck index. |
| `date` | `string` | none | A date such as `"2025-06-01"`, shown on the deck index. A value that isn't a valid date isn't shown. |
| `theme` | `string` | `"default"` | The theme for every slide in the deck: a built-in theme, a plugin theme, or a name from `templates`. |

If `_config.json` isn't valid JSON, or a field has the wrong type, the deck uses the defaults. The dev server shows the error on the slide.

## Package entry points

| Import | What it provides |
|---|---|
| `@astlide/astro` | The Astro integration (default export), `astlideDeckLoader`, and re-exports of `slideSchema`, `deckConfigSchema`, `THEMES`, `defineAstlidePlugin`, `getDeckContext`, `getClientDeckContext` |
| `@astlide/astro/loader` | `astlideDeckLoader` |
| `@astlide/astro/components/*.astro` | Astlide's components, for `.astro` files |
| `@astlide/core` | `slideSchema`, `deckConfigSchema`, `THEMES`, `defineAstlidePlugin`, `getDeckContext`, `getClientDeckContext` |
| `@astlide/core/schema` | `slideSchema`, `deckConfigSchema`, `THEMES` |
| `@astlide/core/plugin` | `defineAstlidePlugin` and the plugin types |
| `@astlide/core/context` | `getDeckContext`, `getClientDeckContext` |
| `@astlide/core/deck` | `readDeck`, `readDecks` and MDX compilation for any JSX runtime (`compileSlideMdx`, `evaluateSlideMdx`) |
| `@astlide/core/deck/pages` | `slidePage`, `printSlides`: what each page of a deck shows |
| `@astlide/core/deck/print-view` | What a print view states for exporters (`printViewAttributes`, `printViewMeta`) |
| `@astlide/core/render` | `renderDeck`: PDF, PNG or PPTX of a deck folder, without a site |
| `@astlide/core/runtime` | The deck runtime the framework packages drive (`mountDeck`), with `runtime/chrome`, `runtime/slide`, `runtime/diagrams`, `runtime/media` and `runtime/pdf-export` |
| `@astlide/core/embed` | The `<astlide-deck>` custom element (`defineAstlideDeck`, `AstlideDeckElement`) |
| `@astlide/core/embed/react` | The `AstlideDeck` React component |
| `@astlide/core/embed/vue` | The `AstlideDeck` Vue component |
| `@astlide/core/pptx` | `pptxToSlides` (PowerPoint to slides) and `pptxToTemplate` |
| `@astlide/core/templates` | Template stores (folder, S3, GCS, Azure) |
| `@astlide/core/mcp` | The MCP server behind `astlide mcp` (`createServer`) and its tool functions, such as `checkDeck`, `importPptx` and `renderDeck` |
| `@astlide/core/engine` | The layout engine behind PPTX export and `check_deck` |
| `@astlide/core/utils/base-path` | `withBase` and other helpers for links under Astro's `base` |
| `@astlide/core/utils/code-highlight` | The `astlideCodeHighlight` Shiki transformer |
| `@astlide/core/utils/mermaid` | The `astlideMermaid` Shiki transformer |
| `@astlide/react`, `@astlide/next`, `@astlide/vue`, `@astlide/nuxt` | See [Next.js](/frameworks/next/), [Nuxt](/frameworks/nuxt/), [React](/frameworks/react/) and [Vue](/frameworks/vue/) |

For every export and its types, see the [API reference](https://astlide.dev/api/).
