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
    }),
  ],
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `toolbar` | `ToolbarItem[]` | `["prev", "counter", "next"]` | Ordered toolbar actions — see [Presenting](/astlide/guides/presenting/#toolbar). |
| `slideDecorators` | `string[]` | `[]` | Components rendered on every slide (module specifiers). |
| `plugins` | `AstlidePlugin[]` | `[]` | Themes, layouts, transitions, Shiki langs / themes, decorators — see [Plugin API](/astlide/guides/themes-and-plugins/#plugin-api). |
| `shikiTheme` | `string` | `"github-dark"` | Shiki theme for code fences. |
| `font` | `false \| string \| { href?, preconnect? }` | Inter from Google Fonts | Web font stylesheet to inject, or `false` for none. |
| `csp` | `boolean \| string` | `true` | Inject a default Content-Security-Policy meta tag, disable it, or provide your own policy. |
| `indexable` | `boolean` | `false` | When `false`, pages carry `noindex, nofollow`. |
| `injectIndexRoute` | `boolean` | auto | Inject the deck index at `/`. Auto-skipped when you have your own `src/pages/index.*`. |
| `drawings.persist` | `boolean` | `false` | Keep pen drawings in `localStorage` across reloads — see [Presenting](/astlide/guides/presenting/#keeping-drawings). |

Astro's own [`base`](/astlide/guides/deploy/) option is honoured as well.

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

Full API: [TypeDoc reference](https://r-hashi01.github.io/astlide/api/).
