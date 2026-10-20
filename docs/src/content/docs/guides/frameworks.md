---
title: React, Vue & Svelte components
description: Use components from React, Vue, Svelte, Solid or Preact in your slides — interactive in the browser, in their first state in PDF and PPTX.
---

Astlide is an Astro integration, so a slide can use components from any framework Astro supports: React, Vue, Svelte, Solid, Preact. Bring the chart, demo widget or design-system component you already have instead of rewriting it for your slides.

## Set up

Add the framework's Astro integration next to Astlide:

```bash
bunx astro add react    # or: vue, svelte, solid-js, preact
```

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

Import it at the top of an `.mdx` slide and use it like any element:

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

Without a `client:*` directive a component is rendered to HTML at build time and ships no JavaScript — fine for charts and diagrams that don't need to react. Add [`client:load`](https://docs.astro.build/en/reference/directives-reference/#client-directives) (or `client:visible`, `client:idle`) to make it interactive while you present.

Components from different frameworks can sit on the same slide.

## In PDF and PPTX

Exports show a component **as it is first rendered**:

- **PDF / PNG** (rendered in a browser): what the slide shows when it loads, after `client:*` components have started.
- **PPTX** (laid out without a browser): the component's server-rendered HTML — its text, boxes and SVG become editable shapes like the rest of the slide.

A component rendered only in the browser (`client:only`) has no HTML at build time, so it is missing from the PPTX. Give it a server-rendered state, or a [static stand-in](/guides/layouts-and-components/#static-stand-ins-for-your-own-embeds): an element marked `data-astlide-static` is shown over it in prints and exports, and hidden while you present.

```mdx
<div style="position: relative">
  <LiveMap client:only="react" />
  <img data-astlide-static src="/map-snapshot.png" alt="Map of our offices"
       style="position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover" />
</div>
```
