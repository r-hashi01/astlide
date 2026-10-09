---
title: Deploying
description: Build a static site and host it anywhere — including under a sub-path such as GitHub Pages.
---

`astro build` produces a static site in `dist/` that any static host can serve.

## Under a sub-path (GitHub Pages)

Astlide honours Astro's [`base`](https://docs.astro.build/en/reference/configuration-reference/#base) option — every internal link, the presenter preview, overview thumbnails and PDF export resolve against it. For a GitHub Pages project site:

```js
// astro.config.mjs
export default defineConfig({
  site: "https://<user>.github.io",
  base: "/<repo>",
  integrations: [astlide()],
});
```

Then deploy `dist/` with GitHub Actions — see Astro's [GitHub Pages guide](https://docs.astro.build/en/guides/deploy/github/).

:::note
Your own absolute URLs in slides (e.g. `![](/photo.jpg)`) are not rewritten. Use relative paths or `import.meta.env.BASE_URL` for them.
:::

## Search engines

Decks are `noindex` by default. Set [`indexable: true`](/astlide/reference/configuration/) to let search engines index them.
