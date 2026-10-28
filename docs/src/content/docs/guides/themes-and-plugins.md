---
title: Themes & Plugins
description: Pick a built-in theme or write your own, extend Astlide with plugins, add elements to every slide, read slide metadata, and choose fonts.
---

## Themes

Astlide has seven built-in themes: `default`, `dark`, `minimal`, `corporate`, `gradient`, `rose` and `forest`. Each deck picks one in its `_config.json`:

```json
{ "theme": "gradient" }
```

The [gallery](/gallery/#themes) shows the same slide in each of them.

### Custom theme

A theme is a CSS file that sets Astlide's custom properties under a `[data-theme="<name>"]` selector. Any property you leave out keeps the `default` theme's value.

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

To use it:

1. Register the file in a plugin's `themes` list, as shown in [Plugin API](#plugin-api).
2. Set `"theme": "my-theme"` in the deck's `_config.json`.

### From a PowerPoint template

A `.pptx`, `.potx` or `.thmx` file can also be a theme. Register it with `astlide({ templates: { brand: './brand.pptx' } })`, and slides take the template's backgrounds, fonts, colors and placeholder positions. See [PowerPoint templates](/guides/templates/).

## Plugin API

A plugin can add themes, layouts, transitions, Shiki languages and themes, and slide decorators. Define it with `defineAstlidePlugin` and pass it to `astlide({ plugins })`:

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

`cssEntrypoint` is imported through Vite. Use a path in your project that starts with `./` (resolved from the project root), or a package path such as `astlide-plugin-midnight/midnight.css`.

A layout can be just a name. Slides that use it get a `.slide-<name>` class, and your plugin's CSS styles that class. To control the slide's markup, give the layout a `componentEntrypoint` that points to an `.astro` component:

```js
layouts: [
  { name: "split-quote", componentEntrypoint: "astlide-plugin-acme/SplitQuote.astro" },
],
```

If two plugins register the same theme, layout or transition name, the first one wins. Built-in names are registered before any plugin, so a plugin can't replace a built-in theme.

### Publishing a plugin

Publish the plugin to npm with these settings:

| Field | Value |
|---|---|
| Package name | `astlide-plugin-*` or `@scope/astlide-plugin-*` |
| `keywords` | include `"astlide-plugin"` |
| `peerDependencies` | `{ "@astlide/core": "^x.y" }` |
| Default export | `defineAstlidePlugin({ … })` |

## Slide decorators

A decorator is a component that Astlide renders on every slide, after the slide's content. Use one for a logo, footer, page number or a link back to the index, so you don't have to add it to each slide file:

```js
astlide({ slideDecorators: ["./src/components/DeckFooter.astro"] });
```

Paths that start with `./` are resolved from the project root. Position the component with CSS; `.slide` is `position: relative`. A plugin can add decorators too, with `decorators: [{ componentEntrypoint: "…" }]`.

## Deck & slide metadata

Inside a slide component or a decorator, `getDeckContext(Astro)` returns the deck name, slide number, total number of slides, layout, transition and the deck's `_config.json`:

```astro
---
// server-side, inside any slide component or decorator
import { getDeckContext } from "@astlide/core/context";
const ctx = getDeckContext(Astro);
---
<footer>{ctx?.config.title} — {ctx?.slideNumber}/{ctx?.totalSlides}</footer>
```

It returns `undefined` outside a slide. In browser scripts, call `getClientDeckContext()` instead; it returns the same fields.

## Fonts

By default Astlide loads Inter for text and JetBrains Mono for code from Google Fonts. That way slides and exported PDFs look the same on every machine. To change this, set `font`:

```js
astlide({ font: false }); // use whatever your CSS specifies
astlide({ font: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans&display=swap" });
```

A URL replaces the default stylesheet, so include Inter or JetBrains Mono in it if you still want them.

### Japanese text

Inter has no Japanese characters, so Japanese text falls back to a font chosen by the browser or OS and looks different from machine to machine. For Japanese slides, load a Japanese web font through `font` and list it in your theme's `--font-body` and `--font-heading`:

```js
astlide({
  font: "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Noto+Sans+JP:wght@400;700&family=JetBrains+Mono&display=swap",
});
```

```css
[data-theme="my-theme"] {
  --font-body: "Inter", "Noto Sans JP", sans-serif;
  --font-heading: "Inter", "Noto Sans JP", sans-serif;
}
```

For the fonts Japanese text gets in a PPTX file, see [Japanese text in PowerPoint](/guides/export/#japanese-text-in-powerpoint).

## Custom home page

Astlide puts a deck index at `/`. If your project has its own `src/pages/index.{astro,md,mdx,html}`, Astlide uses yours and doesn't add the index. To decide this yourself, set `injectIndexRoute: false` (never add the index) or `injectIndexRoute: true` (always add it).
