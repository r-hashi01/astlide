---
title: Deploying
description: Build a static site and host it anywhere, including under a sub-path such as GitHub Pages.
---

Run `astro build` to get a static site in `dist/`. Upload that folder to any static host.

Speaker notes aren't included in this build unless you set [`notes: "public"`](/guides/decks/#speaker-notes).

## Under a sub-path (GitHub Pages)

A GitHub Pages project site is served from a sub-path such as `https://<user>.github.io/<repo>/`. Tell Astro about it with the [`base`](https://docs.astro.build/en/reference/configuration-reference/#base) option:

```js
// astro.config.mjs
export default defineConfig({
  site: "https://<user>.github.io",
  base: "/<repo>",
  integrations: [astlide()],
});
```

Astlide adds `base` to every link it generates. That includes links between slides, the previews in the presenter window, the thumbnails in the overview, and the pages that PDF export renders.

Slide links also follow Astro's [`trailingSlash`](https://docs.astro.build/en/reference/configuration-reference/#trailingslash) and [`build.format`](https://docs.astro.build/en/reference/configuration-reference/#buildformat) options. With the default `directory` format, they end in a slash, as in `/<repo>/my-deck/3/`. That matches the `index.html` files a static host serves, so moving between slides doesn't trigger a redirect.

To publish `dist/` with GitHub Actions, follow Astro's [GitHub Pages guide](https://docs.astro.build/en/guides/deploy/github/).

:::note
Astlide adds `base` to root-relative paths such as `/photo.jpg` in `<ImageSide src>` and in image `background`s. It doesn't rewrite absolute paths you write elsewhere, such as Markdown images (`![](/photo.jpg)`), plain `<img>` tags, or links. For those, use relative paths or `import.meta.env.BASE_URL`.
:::

## Search engines

Slide pages carry `noindex, nofollow` by default. To let search engines index them, set [`indexable: true`](/reference/configuration/).

The page with all of a deck's slides (`/<deck>/all`) keeps `noindex` either way. The home page Astlide generates at `/`, which lists your decks, never has the tag.

## Who can embed your decks

Any site can show your decks in an iframe unless your host says otherwise. To limit that, have your host send a `Content-Security-Policy` header with `frame-ancestors`. See [Framing and headers](/reference/configuration/#framing-and-headers) for examples, and [Embedding a deck](/guides/embed/) for how embedding works.
