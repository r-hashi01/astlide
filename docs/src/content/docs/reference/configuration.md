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
| `csp` | `boolean \| string` | `true` | Inject a default Content-Security-Policy meta tag (on slide pages, `/[deck]/all` and the index; it includes `base-uri 'self'; form-action 'self'; object-src 'none'`), disable it, or provide your own policy. In `astro dev`, `worker-src 'self' blob:` is added (unless set) for Vite's client; the build keeps the policy as is. |
| `indexable` | `boolean` | `false` | When `false`, pages carry `noindex, nofollow`. |
| `injectIndexRoute` | `boolean` | auto | Inject the deck index at `/`. Auto-skipped when you have your own `src/pages/index.*`. |
| `drawings.persist` | `boolean` | `false` | Keep pen drawings in `localStorage` across reloads — see [Presenting](/guides/presenting/#keeping-drawings). |
| `notes` | `"public" \| "dev"` | `"public"` | Where speaker notes are included. `"public"`: every page, so anyone with the URL can read them. `"dev"`: only in `astro dev`; built pages (and exports made from them) carry no notes — see [Speaker notes](/guides/decks/#speaker-notes). |

Astro's own [`base`](/guides/deploy/) option is honoured as well.

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
