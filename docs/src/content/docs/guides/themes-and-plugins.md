---
title: Themes & Plugins
description: Built-in themes, custom themes, the plugin API, slide decorators, deck metadata and fonts.
---

## Themes

Built-in: `default`, `dark`, `minimal`, `corporate`, `gradient`, `rose`, `forest`. Set one per deck in `_config.json`:

```json
{ "theme": "gradient" }
```

### Custom theme

A theme is CSS scoped to `[data-theme="<name>"]` that sets Astlide's custom properties:

```css
/* themes/my-theme.css */
[data-theme="my-theme"] {
  --color-background: #fef3c7;
  --color-foreground: #78350f;
  --color-primary: #d97706;
  --color-secondary: #92400e;
  --color-accent: #fbbf24;
  --color-muted: #fde68a;
  --code-background: #451a03;
}
```

Register it through a plugin (below), then set `"theme": "my-theme"` in the deck's `_config.json`.

## Plugin API

Plugins contribute themes, layouts, transitions, Shiki languages / themes and slide decorators.

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import astlide from "@astlide/core";
import { defineAstlidePlugin } from "@astlide/core/plugin";

const myPlugin = defineAstlidePlugin({
  name: "astlide-plugin-midnight",
  themes: [{ name: "midnight", cssEntrypoint: "./themes/midnight.css" }],
  layouts: [{ name: "split-quote" }],
  transitions: [{ name: "iris" }],
  shiki: {
    langs: [/* additional Shiki langs */],
    themes: [{ name: "neon-night" /* shiki theme JSON */ }],
  },
});

export default defineConfig({
  integrations: [astlide({ plugins: [myPlugin] })],
});
```

`cssEntrypoint` is resolved as a Vite import — any module specifier that resolves to CSS works (relative path, npm package, …).

A layout can register a **name** only (a `.slide-<name>` class is applied so plugin CSS can target it), or supply a `componentEntrypoint` so a plugin `.astro` component owns the slide markup:

```js
layouts: [
  { name: "split-quote", componentEntrypoint: "astlide-plugin-acme/SplitQuote.astro" },
],
```

### Publishing a plugin

| Field | Value |
|---|---|
| Package name | `astlide-plugin-*` or `@scope/astlide-plugin-*` |
| `keywords` | include `"astlide-plugin"` |
| `peerDependencies` | `{ "@astlide/core": "^x.y" }` |
| Default export | `defineAstlidePlugin({ … })` |

## Slide decorators

Render a component on **every** slide — logo, footer, page number, back link — without editing each file:

```js
astlide({ slideDecorators: ["./src/components/DeckFooter.astro"] });
```

Plugins can contribute decorators too (`decorators: [{ componentEntrypoint: "…" }]`).

## Deck & slide metadata

Read the deck name, slide number, total, layout, transition and parsed config:

```astro
---
// server-side, inside any slide component or decorator
import { getDeckContext } from "@astlide/core/context";
const ctx = getDeckContext(Astro);
---
<footer>{ctx?.config.title} — {ctx?.slideNumber}/{ctx?.totalSlides}</footer>
```

In the browser, `getClientDeckContext()` returns the same shape.

## Fonts

Astlide injects the Inter web font by default:

```js
astlide({ font: false }); // use whatever your CSS specifies
astlide({ font: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans&display=swap" });
```

## Custom home page

Astlide serves a deck index at `/`. If you add your own `src/pages/index.{astro,md,mdx,html}`, Astlide detects it and skips its index route. Force either way with `injectIndexRoute: false | true`.
