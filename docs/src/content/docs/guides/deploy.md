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

Slide links also follow Astro's [`trailingSlash`](https://docs.astro.build/en/reference/configuration-reference/#trailingslash) and [`build.format`](https://docs.astro.build/en/reference/configuration-reference/#buildformat): with the default `directory` format they end in `/` (`/<repo>/my-deck/3/`), matching the `index.html` files static hosts serve, so moving between slides costs no redirect.

Then deploy `dist/` with GitHub Actions — see Astro's [GitHub Pages guide](https://docs.astro.build/en/guides/deploy/github/).

:::note
Root-relative paths in `<ImageSide src>` and image `background`s (e.g. `/photo.jpg`) are resolved against `base` for you. Other absolute URLs you write yourself — Markdown images like `![](/photo.jpg)`, raw `<img>` or links — are not rewritten; use relative paths or `import.meta.env.BASE_URL` for those.
:::

## Search engines

Decks are `noindex` by default. Set [`indexable: true`](/astlide/reference/configuration/) to let search engines index them.
