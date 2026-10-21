---
title: Configuration
description: Options for the astlide() integration and deck _config.json.
---

## Integration options

```js
// astro.config.mjs
import astlide from "@astlide/core";

export default defineConfig({
  integrations: [
    astlide({
      toolbar: ["prev", "counter", "next"],
      slideDecorators: [],
      plugins: [],
      shikiTheme: "github-dark",
      font: undefined,
      csp: true,
      indexable: false,
      injectIndexRoute: undefined,
      drawings: { persist: false },
      notes: "public",
    }),
  ],
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `toolbar` | `ToolbarItem[]` | `["prev", "counter", "next"]` | Ordered toolbar actions — see [Presenting](/guides/presenting/#toolbar). |
| `slideDecorators` | `string[]` | `[]` | Components rendered on every slide (module specifiers). |
| `plugins` | `AstlidePlugin[]` | `[]` | Themes, layouts, transitions, Shiki langs / themes, decorators — see [Plugin API](/guides/themes-and-plugins/#plugin-api). |
| `shikiTheme` | `string` | `"github-dark"` | Shiki theme for code fences. |
| `font` | `false \| string \| { href?, preconnect? }` | Inter + JetBrains Mono from Google Fonts | Web font stylesheet to inject, or `false` for none. |
| `favicon` | `string \| false` | auto | Favicon for deck pages and the index. Default: `favicon.svg` / `.ico` / `.png` from `public/` if present, else an empty icon (no request to `/favicon.ico` at the domain root). A root-relative path gets Astro's `base`. `false`: no icon link. |
| `csp` | `boolean \| string` | `true` | Inject a default Content-Security-Policy meta tag (on slide pages, `/[deck]/all` and the index; it includes `base-uri 'self'; form-action 'self'; object-src 'none'`), disable it, or provide your own policy. In a build, the default policy's `script-src` has no `'unsafe-inline'`: the inline scripts Astlide and Astro put on pages — and those of MDX slides and their components, which are code — are allowed by their SHA-256 hashes, added after `astro build`. Inline scripts in Markdown, HTML and PowerPoint slides don't run (see `slideScripts`), nor do inline event-handler attributes (`onclick="…"`) or `javascript:` URLs. `style-src` keeps `'unsafe-inline'` (slides use `style` attributes). In `astro dev`, scripts stay on `'unsafe-inline'` and `worker-src 'self' blob:` is added (unless set) for Vite's client. A policy string of your own is used as is. See [Framing and headers](#framing-and-headers). |
| `slideScripts` | `boolean` | `false` | Let inline `<script>`s in Markdown, HTML and PowerPoint slides run in built pages (their hashes join the default CSP). Off by default: that content can come from others — an imported `.pptx`, an HTML slide someone sent — and the CSP is what stops a script that slipped into it. Turn it on only for decks whose content you fully trust. For a script on your own slides, prefer an MDX slide or a component. The build warns when it leaves slide scripts out. |
| `indexable` | `boolean` | `false` | When `false`, pages carry `noindex, nofollow`. |
| `injectIndexRoute` | `boolean` | auto | Inject the deck index at `/`. Auto-skipped when you have your own `src/pages/index.*`. |
| `drawings.persist` | `boolean` | `false` | Keep pen drawings in `localStorage` across reloads — see [Presenting](/guides/presenting/#keeping-drawings). |
| `notes` | `"public" \| "dev"` | `"public"` | Where speaker notes are included. `"public"`: every page, so anyone with the URL can read them. `"dev"`: only in `astro dev`; built pages (and exports made from them) carry no notes — see [Speaker notes](/guides/decks/#speaker-notes). |

Astro's own [`base`](/guides/deploy/) option is honoured as well.

### Framing and headers

A `<meta>` CSP can't say who may put your deck in an `<iframe>` (`frame-ancestors`), so any site can embed it. Where your host lets you set response headers, add it there — for example `Content-Security-Policy: frame-ancestors 'self' https://your-site.example`:

- **Netlify** — `public/_headers`: `/*` then `  Content-Security-Policy: frame-ancestors 'self'`
- **Cloudflare Pages** — the same `public/_headers` file
- **Vercel** — `vercel.json`: `"headers": [{ "source": "/(.*)", "headers": [{ "key": "Content-Security-Policy", "value": "frame-ancestors 'self'" }] }]`

GitHub Pages can't set headers. Allow the sites that use [`<astlide-deck>`](/guides/embed/) to embed your decks.

## Deck `_config.json`

| Field | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | folder name | Shown on the deck index and in the browser tab. |
| `author` | `string` | — | Shown on the deck index. |
| `date` | `string` | — | ISO date shown on the deck index. |
| `theme` | `string` | `"default"` | Built-in or plugin theme name. |

## Package entry points

| Import | Contents |
|---|---|
| `@astlide/core` | the integration (default export), `astlideDeckLoader`, `slideSchema`, `deckConfigSchema`, `THEMES`, `defineAstlidePlugin`, context helpers |
| `@astlide/core/plugin` | `defineAstlidePlugin` and plugin types |
| `@astlide/core/context` | `getDeckContext`, `getClientDeckContext` |
| `@astlide/core/utils/code-highlight` | `astlideCodeHighlight` Shiki transformer |
| `@astlide/core/utils/mermaid` | `astlideMermaid` Shiki transformer |

Full API: [TypeDoc reference](https://astlide.dev/api/).
