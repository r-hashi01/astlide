---
title: React, Vue & Svelte components
description: Use components from React, Vue, Svelte, Solid or Preact in your slides. They are interactive in the browser and appear in their first rendered state in PDF and PPTX.
---

Astlide runs inside Astro, so your slides can use components from any framework Astro supports: React, Vue, Svelte, Solid and Preact. If you already have a chart, a demo widget or a design-system component, you can put it on a slide as it is.

## Set up

Add the framework's Astro integration to your project:

```bash
bunx astro add react    # or: vue, svelte, solid-js, preact
```

`astro add` installs the package and adds the integration to `astro.config.mjs`. Afterwards it should look like this, with the framework next to Astlide:

```js
// astro.config.mjs
import astlide from "@astlide/core";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [react(), astlide()],
});
```

## Use a component in a slide

Import the component at the top of an `.mdx` slide, then use it like any other tag:

```mdx
---
title: Live demo
---
import Counter from "../../../components/Counter.tsx";
import PriceChart from "../../../components/PriceChart.vue";

# Live demo

<PriceChart quarter="Q3" />

<Counter label="Clicks" client:load />
```

The import path is relative to the slide. From `src/content/decks/<deck>/`, `../../../components/` points to `src/components/`.

By default, Astro renders a component to HTML at build time and sends no JavaScript for it. That is enough for a chart or a diagram that doesn't respond to input. To make a component interactive while you present, add a [`client:*` directive](https://docs.astro.build/en/reference/directives-reference/#client-directives) such as `client:load`, `client:visible` or `client:idle`.

One slide can mix components from different frameworks.

## In PDF and PPTX

Exports show each component in its first rendered state. What that means depends on the format:

- **PDF and PNG** are rendered in a browser. They show the slide as it looks right after loading, once its `client:*` components have started.
- **PPTX** is laid out without a browser, from the component's server-rendered HTML. Its text, boxes and SVG become editable shapes, like the rest of the slide.

A component with `client:only` renders only in the browser, so there is no HTML for it at build time, and it doesn't appear in the PPTX. To fix that, either let the component render on the server, or add a [static stand-in](/guides/layouts-and-components/#static-stand-ins-for-your-own-embeds). An element with `data-astlide-static` appears over the component in prints and exports, and stays hidden while you present.

```mdx
<div style="position: relative">
  <LiveMap client:only="react" />
  <img data-astlide-static src="/map-snapshot.png" alt="Map of our offices"
       style="position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover" />
</div>
```
